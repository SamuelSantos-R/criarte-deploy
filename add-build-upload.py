import re, sys

with open('/app/.next/standalone/.next/server/app/api/sites/upload/route.js', 'r') as f:
    text = f.read()

# Find the index.html check and replace with build-or-serve logic
old_pattern = (
    'let n=(0,w.join)(j,"index.html");'
    'if(!(0,v.existsSync)(n))'
    'return(0,v.rmSync)(j,{recursive:!0,force:!0}),'
    'u.NextResponse.json({error:"O zip precisa conter index.html na raiz"},{status:400})'
)

new_build_logic = (
    'let n=(0,w.join)(j,"index.html");'
    'if(!(0,v.existsSync)(n)){'
    'let p=(0,w.join)(j,"package.json");'
    'if((0,v.existsSync)(p)){'
    'try{'
    'console.log("[build] detected Next.js source, building...");'
    'JSON.parse((0,v.readFileSync)(p,"utf8"));'
    'writeFileSync(join(j,"next.config.js"),'
    '"const nextConfig={output:\\'export\\',basePath:\\'/"+d+"\\',images:{unoptimized:true}};module.exports=nextConfig;");'
    'writeFileSync(join(j,".npmrc"),"ignore-scripts=true\\n");'
    'execSync("cd \\""+j+"\\"&&npm install--no-audit--no-fund--loglevel=error 2>&1",{stdio:"pipe",timeout:120000});'
    'execSync("cd \\""+j+"\\"&&npx next build 2>&1",{stdio:"pipe",timeout:300000});'
    'var x=join(j,"out");'
    'if(existsSync(x)){'
    'rmSync(j,{recursive:!0,force:!0});'
    'mkdirSync(j,{recursive:!0});'
    'cpSync(x,j,{recursive:!0});'
    'console.log("[build] out/ deployed");'
    '}else{'
    'console.log("[build] no out/, keeping source");'
    '}'
    '}catch(b){'
    'rmSync(j,{recursive:!0,force:!0});'
    'return NextResponse.json({error:"Build failed: "+b.message},{status:500});'
    '}'
    '}else{'
    'rmSync(j,{recursive:!0,force:!0});'
    'return NextResponse.json({error:"No index.html or package.json found"},{status:400});'
    '}'
    '}'
)

if old_pattern in text:
    text = text.replace(old_pattern, new_build_logic)
    print('BUILD LOGIC INJECTED SUCCESSFULLY')
else:
    print('ERROR: Original pattern not found')
    idx = text.find('"O zip precisa conter index.html na raiz"')
    if idx >= 0:
        print(f'Found error text at index {idx}')
        print(f'Context: {text[idx-80:idx+80]}')
    sys.exit(1)

with open('/app/.next/standalone/.next/server/app/api/sites/upload/route.js', 'w') as f:
    f.write(text)
print('DONE')