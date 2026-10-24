// Standalone layout regression; no Python kernel or user vault is required.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/tiyukains/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
(async()=>{
 const server=createServer(async(req,res)=>{
  try{const name=req.url.split('?')[0]==='/styles.css'?'styles.css':'tests/fixtures/gutter-layout.html';
   res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/html');
   res.end(await readFile(path.join(__dirname,'..',name)));
  }catch(error){res.statusCode=500;res.end(String(error))}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const width of [1100,520])for(const font of [14,24,32]){
   const page=await browser.newPage({viewport:{width,height:760}});
   try{
    await page.goto(`http://127.0.0.1:${server.address().port}/?font=${font}`);
    const cells=await page.locator('.ipynb-cell').evaluateAll(nodes=>nodes.map((c,i)=>{
     const r=c.getBoundingClientRect(),g=c.querySelector('.ipynb-cell-gutter').getBoundingClientRect(),b=c.querySelector('.ipynb-cell-body').getBoundingClientRect();
     const next=nodes[i+1]?.getBoundingClientRect(),code=c.querySelector('.cm-editor').getBoundingClientRect(),time=c.querySelector('.ipynb-execution-time'),t=time.getBoundingClientRect(),output=c.querySelector('.ipynb-output').getBoundingClientRect();
     return {minimum:code.height>=72,timing:time.hidden||(t.top>=code.bottom&&t.bottom<=output.top),contained:g.top>=r.top&&g.bottom<=r.bottom+1,separate:!next||g.bottom<=next.top,aligned:b.left-g.right};
    }));
    assert.equal(cells.length,6);
    for(const cell of cells){assert.ok(cell.minimum,'short code must retain minimum height');assert.ok(cell.timing,'timing belongs between code and output');assert.ok(cell.contained,`gutter overflow: width=${width}, font=${font}`);assert.ok(cell.separate,'gutter overlaps next cell');assert.ok(cell.aligned>=5,'gutter collides with code')}
   }finally{await page.close()}
  }
  console.log('PASS short/long cells, with/without timing, narrow layout and enlarged UI fonts');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
