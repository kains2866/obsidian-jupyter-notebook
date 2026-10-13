const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/tiyukains/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:760}});
  await page.goto('http://127.0.0.1:4318');await page.locator('.ipynb-toolbar').waitFor();
  await page.evaluate(()=>{
   const root=document.getElementById('app');root.classList.add('view-content');
   const leaf=document.createElement('div');leaf.className='workspace-leaf';
   const content=document.createElement('div');content.className='workspace-leaf-content';content.dataset.type='native-ipynb';content.style.height='100vh';
   root.replaceWith(leaf);leaf.append(content);content.append(root);
   const style=document.createElement('style');style.textContent='.workspace-leaf .view-content {padding:12px 12px 32px;}';document.head.append(style);
   for(let i=0;i<40;i++){const p=document.createElement('p');p.textContent='用于验证吸顶工具栏的滚动内容 '+i;root.append(p)}
   root.scrollTop=300;
  });
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  const positions=await page.evaluate(()=>{const root=document.getElementById('app'),toolbar=root.querySelector('.ipynb-toolbar');return {paddingTop:getComputedStyle(root).paddingTop,gap:toolbar.getBoundingClientRect().top-root.getBoundingClientRect().top,scroll:root.scrollTop,background:getComputedStyle(toolbar).backgroundColor}});
  assert.equal(positions.paddingTop,'0px','主题不能给 Notebook 容器增加顶部空隙');
  assert.ok(positions.scroll>0);assert.ok(Math.abs(positions.gap)<=1,'滚动后工具栏必须贴齐容器顶部');
  assert.ok(/^rgb\(/.test(positions.background)||/,\s*1\)$/.test(positions.background),'工具栏背景必须完全不透明');
  console.log('PASS 主题内边距覆盖、吸顶无缝隙和不透明背景');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
