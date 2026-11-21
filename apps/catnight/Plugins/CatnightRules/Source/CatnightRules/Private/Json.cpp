#include "CatnightRules/Json.h"

#include <algorithm>
#include <charconv>

namespace catnight {

Json& Json::Set(std::string_view key, Json v) {
  for (auto& [k, val] : obj_) {
    if (k == key) {
      val = std::move(v);
      return *this;
    }
  }
  obj_.emplace_back(std::string(key), std::move(v));
  return *this;
}

const Json* Json::Get(std::string_view key) const {
  for (const auto& [k, val] : obj_)
    if (k == key) return &val;
  return nullptr;
}

namespace {
void Quote(std::string& out, const std::string& s) {
  out.push_back('"');
  for (char c : s) {
    if (c == '"' || c == '\\') out.push_back('\\');
    out.push_back(c);
  }
  out.push_back('"');
}
}  // namespace

void Json::Write(std::string& out) const {
  switch (kind_) {
    case Kind::Null: out += "null"; return;
    case Kind::Bool: out += b_ ? "true" : "false"; return;
    case Kind::Int: out += std::to_string(i_); return;
    case Kind::Str: Quote(out, s_); return;
    case Kind::Arr:
      out.push_back('[');
      for (size_t i = 0; i < arr_.size(); i++) {
        if (i) out.push_back(',');
        arr_[i].Write(out);
      }
      out.push_back(']');
      return;
    case Kind::Obj: {
      std::vector<const std::pair<std::string, Json>*> fields;
      fields.reserve(obj_.size());
      for (const auto& f : obj_) fields.push_back(&f);
      if (!keepOrder_) {
        std::sort(fields.begin(), fields.end(), [](auto* a, auto* b) { return a->first < b->first; });
      }
      out.push_back('{');
      for (size_t i = 0; i < fields.size(); i++) {
        if (i) out.push_back(',');
        Quote(out, fields[i]->first);
        out.push_back(':');
        fields[i]->second.Write(out);
      }
      out.push_back('}');
      return;
    }
  }
}

std::string Json::Canonical() const {
  std::string out;
  Write(out);
  return out;
}

namespace {
struct Parser {
  std::string_view t;
  size_t i = 0;
  std::string err;

  void Ws() {
    while (i < t.size() && (t[i] == ' ' || t[i] == '\n' || t[i] == '\r' || t[i] == '\t')) i++;
  }
  bool Fail(const char* m) {
    if (err.empty()) err = std::string(m) + " at " + std::to_string(i);
    return false;
  }
  bool Lit(std::string_view w) {
    if (t.substr(i, w.size()) != w) return Fail("bad literal");
    i += w.size();
    return true;
  }
  bool Str(std::string& out) {
    if (i >= t.size() || t[i] != '"') return Fail("expected string");
    i++;
    while (i < t.size() && t[i] != '"') {
      char c = t[i++];
      if (c == '\\') {
        if (i >= t.size()) return Fail("bad escape");
        char e = t[i++];
        switch (e) {
          case '"': out.push_back('"'); break;
          case '\\': out.push_back('\\'); break;
          case '/': out.push_back('/'); break;
          case 'n': out.push_back('\n'); break;
          case 't': out.push_back('\t'); break;
          case 'r': out.push_back('\r'); break;
          case 'b': out.push_back('\b'); break;
          case 'f': out.push_back('\f'); break;
          case 'u': {
            if (i + 4 > t.size()) return Fail("bad \\u");
            unsigned code = 0;
            auto r = std::from_chars(t.data() + i, t.data() + i + 4, code, 16);
            if (r.ec != std::errc()) return Fail("bad \\u");
            i += 4;
            if (code < 0x80) {
              out.push_back(static_cast<char>(code));
            } else if (code < 0x800) {
              out.push_back(static_cast<char>(0xC0 | (code >> 6)));
              out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
            } else {
              out.push_back(static_cast<char>(0xE0 | (code >> 12)));
              out.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3F)));
              out.push_back(static_cast<char>(0x80 | (code & 0x3F)));
            }
            break;
          }
          default: return Fail("bad escape");
        }
      } else {
        out.push_back(c);
      }
    }
    if (i >= t.size()) return Fail("unterminated string");
    i++;
    return true;
  }
  bool Value(Json& out) {
    Ws();
    if (i >= t.size()) return Fail("unexpected end");
    char c = t[i];
    if (c == '{') {
      i++;
      out = Json::Object();
      Ws();
      if (i < t.size() && t[i] == '}') {
        i++;
        return true;
      }
      for (;;) {
        Ws();
        std::string key;
        if (!Str(key)) return false;
        Ws();
        if (i >= t.size() || t[i] != ':') return Fail("expected :");
        i++;
        Json v;
        if (!Value(v)) return false;
        out.Set(key, std::move(v));
        Ws();
        if (i < t.size() && t[i] == ',') {
          i++;
          continue;
        }
        if (i < t.size() && t[i] == '}') {
          i++;
          return true;
        }
        return Fail("expected , or }");
      }
    }
    if (c == '[') {
      i++;
      out = Json::Array();
      Ws();
      if (i < t.size() && t[i] == ']') {
        i++;
        return true;
      }
      for (;;) {
        Json v;
        if (!Value(v)) return false;
        out.Push(std::move(v));
        Ws();
        if (i < t.size() && t[i] == ',') {
          i++;
          continue;
        }
        if (i < t.size() && t[i] == ']') {
          i++;
          return true;
        }
        return Fail("expected , or ]");
      }
    }
    if (c == '"') {
      std::string s;
      if (!Str(s)) return false;
      out = Json(std::move(s));
      return true;
    }
    if (c == 't') {
      out = Json(true);
      return Lit("true");
    }
    if (c == 'f') {
      out = Json(false);
      return Lit("false");
    }
    if (c == 'n') {
      out = Json();
      return Lit("null");
    }
    int64_t n = 0;
    auto r = std::from_chars(t.data() + i, t.data() + t.size(), n);
    if (r.ec != std::errc()) return Fail("bad number");
    i = static_cast<size_t>(r.ptr - t.data());
    if (i < t.size() && (t[i] == '.' || t[i] == 'e' || t[i] == 'E')) return Fail("fractions are not supported");
    out = Json(n);
    return true;
  }
};
}  // namespace

Json Json::Parse(std::string_view text, std::string* error) {
  Parser p{text};
  Json out;
  if (!p.Value(out)) {
    if (error) *error = p.err;
    return Json();
  }
  p.Ws();
  if (p.i != text.size()) {
    if (error) *error = "trailing text at " + std::to_string(p.i);
    return Json();
  }
  return out;
}

std::string GoldenHash(std::string_view text) {
  uint32_t a = 0x811c9dc5u;
  uint32_t b = 0x9747b28cu;
  for (unsigned char c : text) {
    a = (a ^ c) * 16777619u;
    b = (b ^ c) * 0x5bd1e995u;
    b = b ^ (b >> 13);
  }
  char buf[17];
  static const char* kHex = "0123456789abcdef";
  for (int k = 0; k < 8; k++) {
    buf[k] = kHex[(a >> (28 - 4 * k)) & 0xF];
    buf[8 + k] = kHex[(b >> (28 - 4 * k)) & 0xF];
  }
  buf[16] = 0;
  return std::string(buf);
}

}  // namespace catnight
