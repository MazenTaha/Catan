// A small JSON value for records, saves and the golden tests. Integers only (the rules
// never produce fractions); objects keep insertion order, and canonical output sorts keys
// unless the object is marked `keepOrder` (the state's buildings and causeways).
#pragma once

#include <cstdint>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace catnight {

class Json {
 public:
  enum class Kind : uint8_t { Null, Bool, Int, Str, Arr, Obj };

  Json() = default;
  Json(std::nullptr_t) {}
  Json(bool b) : kind_(Kind::Bool), b_(b) {}
  Json(int i) : kind_(Kind::Int), i_(i) {}
  Json(int64_t i) : kind_(Kind::Int), i_(i) {}
  Json(uint32_t i) : kind_(Kind::Int), i_(i) {}
  Json(const char* s) : kind_(Kind::Str), s_(s) {}
  Json(std::string s) : kind_(Kind::Str), s_(std::move(s)) {}
  Json(std::string_view s) : kind_(Kind::Str), s_(s) {}

  static Json Array() {
    Json j;
    j.kind_ = Kind::Arr;
    return j;
  }
  static Json Object(bool keepOrder = false) {
    Json j;
    j.kind_ = Kind::Obj;
    j.keepOrder_ = keepOrder;
    return j;
  }

  Kind kind() const { return kind_; }
  bool IsNull() const { return kind_ == Kind::Null; }
  bool IsInt() const { return kind_ == Kind::Int; }
  bool IsStr() const { return kind_ == Kind::Str; }
  bool IsArr() const { return kind_ == Kind::Arr; }
  bool IsObj() const { return kind_ == Kind::Obj; }
  bool IsBool() const { return kind_ == Kind::Bool; }

  bool AsBool() const { return b_; }
  int64_t AsInt() const { return i_; }
  const std::string& AsStr() const { return s_; }
  const std::vector<Json>& Items() const { return arr_; }
  const std::vector<std::pair<std::string, Json>>& Fields() const { return obj_; }

  /** Appends to an array. */
  Json& Push(Json v) {
    arr_.push_back(std::move(v));
    return *this;
  }
  /** Sets an object field (replacing an existing one). */
  Json& Set(std::string_view key, Json v);
  /** Object field, or nullptr. */
  const Json* Get(std::string_view key) const;
  bool Has(std::string_view key) const { return Get(key) != nullptr; }

  /** Canonical text: sorted keys (except keepOrder objects), no spaces. */
  std::string Canonical() const;

  /** Parses `text`; on failure returns Null and fills `error`. */
  static Json Parse(std::string_view text, std::string* error = nullptr);

 private:
  void Write(std::string& out) const;

  Kind kind_ = Kind::Null;
  bool b_ = false;
  bool keepOrder_ = false;
  int64_t i_ = 0;
  std::string s_;
  std::vector<Json> arr_;
  std::vector<std::pair<std::string, Json>> obj_;
};

/** Two 32-bit hashes as 16 hex digits (mirrors `hash` in native/golden/export.ts). */
std::string GoldenHash(std::string_view text);

}  // namespace catnight
