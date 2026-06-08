import re
import sys

with open('/app/.next/standalone/.next/server/app/api/sites/upload/route.js', 'r') as f:
    text = f.read()

old = 'let n=(0,w.join)(j,"index.html");if(!(0,v.existsSync)(n))return(0,v.rmSync)(j,{recursive:!0,force:!0}),u.NextResponse.json({error:"O zip precisa conter index.html na raiz"},{status:400})'

new = (
    'let n=(0,w.join)(j,"index.html");'
    'if(!(0,v.existsSync)(n)){'
    'let p=(0,w.join)(j,"package.json");'
    'if((0,v.existsSync)(p)){'
    'try{'
    'console.log("[build] Source project detected, building...");'
    'JSON.parse((0,v.readFileSync)(p,"utf8"));'
    'var r=(0,w.join)(j,"next.config.js");'
    'var t="module.exports={...require(\\'./next.config.js\\'),output:\\'export\\',basePath:\\'/"+d+"\\',images:{unoptimized:true}};";'
    '(0,v.writeFileSync)(r,t);'
    '(0,v.writeFileSync)((0,w.join)(j,".npmrc"),"ignore-scripts=true\\n");'
    'var u=require("child_process");'
    'u.execSync("cd \\""+j+"\\" && npm install --no-audit --no-fund --loglevel=error 2>&1",{stdio:"pipe",timeout:120000});'
    'console.log("[build] npm install done");'
    'u.execSync("cd \\""+j+"\\" && npx next build 2>&1",{stdio:"pipe",timeout:300000});'
    'console.log("[build] next build done");'
    'var x=(0,w.join)(j,"out");'
    'if((0,v.existsSync)(x)){'
    '(0,v.rmSync)(j,{recursive:!0,force:!0});'
    '(0,v.cpSync)(x,j,{recursive:!0});'
    'console.log("[build] out/ copied to site dir");'
    '}else{'
    'console.log("[build] no out/ - keeping source as is");'
    '}'
    '}catch(b){'
    'console.log("[build] error:"+b.message);'
    '(0,v.rmSync)(j,{recursive:!0,force:!0});'
    'return u.NextResponse.json({error:"Falha ao buildar o site: "+b.message},{status:500});'
    '}'
    '}else{'
    '(0,v.rmSync)(j,{recursive:!0,force:!0});'
    'return u.NextResponse.json({error:"O zip precisa conter index.html na raiz"},{status:400});'
    '}'
    '}'
)

if old in text:
    text = text.replace(old, new)
    print('BUILD STEP ADDED OK')
else:
    print('ERROR: Pattern not found')
    idx = text.find('index.html')
    if idx >= 0:
        print(f'Found "index.html" at {idx}')
        print(f'Context: {text[idx:idx+200]}')
    sys.exit(1)

with open('/app/.next/standalone/.next/server/app/api/sites/upload/route.js', 'w') as f:
    f.write(text)
print('DONE')