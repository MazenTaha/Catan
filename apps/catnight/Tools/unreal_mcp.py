"""Small stdlib client for Epic's local Unreal MCP; useful before Codex reloads its tool list.

Example: python Tools/unreal_mcp.py --url http://127.0.0.1:8001/mcp describe EditorToolset.EditorAppToolset
Calls are deliberately sequential: Unreal dispatches them on the game thread.
"""
import argparse
import json
import urllib.request
from pathlib import Path


class UnrealMCP:
    def __init__(self, url):
        self.url, self.session, self.sequence = url, None, 0
        self.rpc('initialize', {'protocolVersion':'2025-11-25','capabilities':{},
            'clientInfo':{'name':'catnight-island-review','version':'1.0'}})
        self.rpc('notifications/initialized', None, notify=True)

    def rpc(self, method, params, notify=False):
        self.sequence += 1
        body={'jsonrpc':'2.0','method':method}
        if params is not None: body['params']=params
        if not notify: body['id']=self.sequence
        headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'}
        if self.session: headers['Mcp-Session-Id']=self.session
        request=urllib.request.Request(self.url,data=json.dumps(body).encode(),headers=headers)
        with urllib.request.urlopen(request,timeout=180) as response:
            self.session=response.headers.get('Mcp-Session-Id',self.session)
            text=response.read().decode()
        if not text.strip(): return None
        result=json.loads(text)
        if 'error' in result: raise RuntimeError(result['error'])
        result=result.get('result',{})
        if result.get('isError'): raise RuntimeError(result)
        return result

    def tool(self, name, arguments):
        return self.rpc('tools/call',{'name':name,'arguments':arguments})


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url',default='http://127.0.0.1:8000/mcp')
    parser.add_argument('--out',type=Path)
    parser.add_argument('operation',choices=['list','describe','call'])
    parser.add_argument('toolset',nargs='?')
    parser.add_argument('tool',nargs='?')
    parser.add_argument('--args-file',type=Path)
    args=parser.parse_args()
    client=UnrealMCP(args.url)
    if args.operation=='list': result=client.tool('list_toolsets',{})
    elif args.operation=='describe': result=client.tool('describe_toolset',{'toolset_name':args.toolset})
    else: result=client.tool('call_tool',{'toolset_name':args.toolset,'tool_name':args.tool,
        'arguments':json.loads(args.args_file.read_text(encoding='utf-8-sig')) if args.args_file else {}})
    output=json.dumps(result,indent=2)
    if args.out: args.out.parent.mkdir(parents=True,exist_ok=True); args.out.write_text(output,encoding='utf-8')
    else: print(output)


if __name__=='__main__': main()
