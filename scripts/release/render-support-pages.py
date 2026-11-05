"""Generate public static IShift pages after an owner supplies the public email."""
import argparse, html, json, pathlib, re
from urllib.parse import quote
parser = argparse.ArgumentParser()
parser.add_argument('--public-email', required=True)
parser.add_argument('--out', required=True, type=pathlib.Path)
args = parser.parse_args()
if not re.fullmatch(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', args.public_email):
    parser.error('supply the approved public support mailbox')
root = pathlib.Path(__file__).resolve().parents[2]
copy = json.loads((root/'apps/mobile/src/content/privacy.json').read_text())
mail = '<a href="mailto:' + quote(args.public_email, safe='@.+-') + '">' + html.escape(args.public_email) + '</a>'
for page in ('support', 'privacy'):
    folder = args.out/page
    folder.mkdir(parents=True, exist_ok=True)
    parts = ['<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">', '<title>IShift · '+ ('客服與支援' if page=='support' else '隱私政策')+'</title><style>body{max-width:44rem;margin:3rem auto;padding:0 1.2rem;font:1rem/1.65 system-ui;color:#263746}a{color:#116574}</style><main>']
    for lang in ('zh-TW','en'):
        c = copy[lang]
        zh = lang=='zh-TW'
        parts += ['<section lang="'+lang+'">']
        if page=='privacy':
            parts += ['<h1>IShift · '+html.escape(c['title'])+'</h1>', '<p>'+html.escape(c['date'])+'</p>']
            for title,body in c['sections']:
                parts += ['<h2>'+html.escape(title)+'</h2><p>'+html.escape(body)+'</p>']
        else:
            parts += ['<h1>IShift · '+('客服與支援' if zh else 'Help and support')+'</h1>', '<p>'+('辨識結果可以先核對再儲存。匯出日曆前，請檢查班別代號、標題與時間。回報問題時請附上 App 版本和操作步驟；不要寄密碼、驗證碼或真實員工班表。' if zh else 'Review recognized shifts before saving. Check codes, titles and times before exporting. To report a problem, include your app version and steps. Do not send passwords, verification codes or real employee rosters.')+'</p>']
        parts += ['<p>'+('客服及隱私聯絡方式（不需登入）：' if zh else 'Contact us about support or privacy (no sign-in needed): ')+mail+'</p></section>']
    other='privacy' if page=='support' else 'support'
    parts += ['<a href="../'+other+'/">'+('隱私政策 · Privacy' if other=='privacy' else '客服 · Support')+'</a></main></html>']
    (folder/'index.html').write_text('\n'.join(parts))
