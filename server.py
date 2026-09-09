from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse
import json, re, zipfile, xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
DB_FILE = ROOT / 'database' / '感情系統資料庫.xlsx'
INTL_DB_FILE = ROOT / 'database' / '國際賽事資料庫.xlsx'
PORT = 8881
NS = {'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'p':'http://schemas.openxmlformats.org/package/2006/relationships'}

def col_index(ref):
    letters = re.match(r'[A-Z]+', ref or 'A').group(0)
    out = 0
    for ch in letters: out = out * 26 + ord(ch) - 64
    return out - 1

def workbook_rows(path):
    with zipfile.ZipFile(path) as z:
        shared=[]
        if 'xl/sharedStrings.xml' in z.namelist():
            root=ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root.findall('m:si',NS): shared.append(''.join(t.text or '' for t in si.iter('{%s}t'%NS['m'])))
        wb=ET.fromstring(z.read('xl/workbook.xml'))
        rel=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        targets={x.attrib['Id']:x.attrib['Target'] for x in rel.findall('p:Relationship',NS)}
        result={}
        for sh in wb.find('m:sheets',NS):
            name=sh.attrib['name'];rid=sh.attrib['{%s}id'%NS['r']]
            target=targets[rid].lstrip('/')
            if not target.startswith('xl/'): target='xl/'+target
            xml=ET.fromstring(z.read(target)); matrix=[]
            for row in xml.findall('.//m:sheetData/m:row',NS):
                vals={}
                for c in row.findall('m:c',NS):
                    idx=col_index(c.attrib.get('r'));typ=c.attrib.get('t','');v=c.find('m:v',NS)
                    if typ=='inlineStr': val=''.join(t.text or '' for t in c.iter('{%s}t'%NS['m']))
                    elif v is None: val=''
                    elif typ=='s': val=shared[int(v.text)]
                    elif typ=='b': val=v.text=='1'
                    else:
                        raw=v.text or ''
                        try: val=float(raw) if '.' in raw else int(raw)
                        except ValueError: val=raw
                    vals[idx]=val
                if vals: matrix.append([vals.get(i,'') for i in range(max(vals)+1)])
            if not matrix: result[name]=[];continue
            header_at=next((i for i,row in enumerate(matrix) if any(str(x).strip()=='enabled' for x in row)),None)
            if header_at is None: result[name]=[];continue
            headers=[str(x).strip() for x in matrix[header_at]];rows=[]
            for arr in matrix[header_at+1:]:
                obj={headers[i]:arr[i] if i<len(arr) else '' for i in range(len(headers)) if headers[i]}
                if any(v not in ('',None) for v in obj.values()): rows.append(obj)
            result[name]=rows
        return result

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store, no-cache, must-revalidate, max-age=0')
        super().end_headers()
    def do_GET(self):
        path=urlparse(self.path).path
        if path=='/api/version': return self.send_json({'version':'0.30.0'})
        if path=='/api/relationship-db':
            try: return self.send_json({'source':DB_FILE.name,'sheets':workbook_rows(DB_FILE)})
            except Exception as e: return self.send_json({'error':str(e)},500)
        if path=='/api/international-db':
            try: return self.send_json({'source':INTL_DB_FILE.name,'sheets':workbook_rows(INTL_DB_FILE)})
            except Exception as e: return self.send_json({'error':str(e)},500)
        return super().do_GET()
    def send_json(self,obj,status=200):
        data=json.dumps(obj,ensure_ascii=False).encode('utf-8')
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)

if __name__=='__main__':
    import os
    os.chdir(ROOT)
    print('YaKyoLife offline server v0.30.0: http://127.0.0.1:%d/'%PORT)
    ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
