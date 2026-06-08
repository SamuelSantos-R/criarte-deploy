import re

with open("/app/.next/standalone/.next/server/app/api/sites/upload/route.js", "r") as f:
    text = f.read()

old = 'let n=(0,w.join)(j,"index.html");if(!(0,v.existsSync)(n))return(0,v.rmSync)(j,{recursive:!0,force:!0}),u.NextResponse.json({error:"O zip precisa conter index.html na raiz"},{status:400})'

new = (
    'let n=(0,w.join)(j,"index.html");'
    'if(!(0,v.existsSync)(n)){'
    'let p=(0,w.join)(j,"package.json");'
    'if((0,v.existsSync)(p)){'
    'try{'
    'console.log("[build]");'
    'JSON.parse((0,v.readFileSync)(p,"utf8"));'
    'writeFileSync(join(j,"next.config.js"),'
    + '"const nextConfig={output:\\"export\\",basePath:\\"/"+d+"\\",images:{unoptimized:true}};module.exports=nextConfig;"'
    + ');'
    'writeFileSync(join(j,".npmrc"),"ignore-scripts=true\\n");'
    'execSync('
    + '"cd \\""+j+"\\"&&npm install --no-audit --no-fund --loglevel=error 2>&1"'
    + ',{stdio:"pipe",timeout:120000});'
    'execSync('
    + '"cd \\""+j+"\\"&&npx next build 2>&1"'
    + ',{stdio:"pipe",timeout:300000});'
    'var x=join(j,"out");'
    'if(existsSync(x)){'
    'rmSync(j,{recursive:!0,force:!0});'
    'mkdirSync(j,{recursive:!0});'
    'cpSync(x,j,{recursive:!0});'
    '}'
    '}catch(b){'
    'console.log("[build] error:"+b.message);'
    'rmSync(j,{recursive:!0,force:!0});'
    'return NextResponse.json({error:"Build: "+b.message},{status:500});'
    '}'
    '}else{'
    'rmSync(j,{recursive:!0,force:!0});'
    'return u.NextResponse.json({error:"O zip precisa conter index.html na raiz"},{status:400});'
    '}'
    '}'
)

if old in text:
    text = text.replace(old, new)
    print("BUILD LOGIC ADDED")
else:
    print("ERROR: pattern not found")
    idx = text.find("index.html")
    if idx >= 0:
        print("Found at", idx, ":", text[idx:idx+140])
    import sys; sys.exit(1)

with open("/app/.next/standalone/.next/server/app/api/sites/upload/route.js", "w") as f:
    f.write(text)
print("DONE")