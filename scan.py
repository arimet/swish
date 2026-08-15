import re, subprocess, sys, collections
FR = re.compile(r'\b(le|la|les|un|une|des|du|de|au|aux|et|ou|mais|donc|car|ne|pas|que|qui|quoi|dont|où|est|sont|être|avoir|fait|faire|dans|sur|sous|avec|sans|pour|par|plus|moins|tout|tous|toute|toutes|même|aussi|alors|ainsi|cette|ce|ces|son|sa|ses|leur|leurs|nous|vous|ils|elles|on|il|elle|se|si|comme|quand|déjà|encore|jamais|toujours|rien|quelque|chaque|entre|vers|depuis|jusqu|après|avant|pendant|celui|celle|ceux|elles)\b', re.I)
files = subprocess.run(['git','ls-files'],capture_output=True,text=True).stdout.split()
tot = collections.Counter()
per = {}
for f in files:
    if not re.search(r'\.(ts|tsx|css|sql|json|md|html)$', f): continue
    try: s = open(f).read()
    except Exception: continue
    n = 0
    for line in s.split('\n'):
        hits = FR.findall(line)
        if len(hits) >= 2: n += 1
    if n: per[f] = n
for f, n in sorted(per.items(), key=lambda kv: -kv[1]):
    print(f'{n:5d}  {f}')
print('---')
print('files:', len(per), 'lines:', sum(per.values()))
