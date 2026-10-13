const {chromium}=require(process.env.PLAYWRIGHT_MODULE || '/Users/tiyukains/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 // Obsidian profiles share the CLI socket; do not replace a running user's IPC endpoint.
 try {
  await fs.access(path.join(os.homedir(), '.obsidian-cli.sock'));
  throw new Error('请先正常退出日常 Obsidian，再运行隔离实机测试，避免共享 CLI 连接冲突。');
 } catch (error) {
  if (error.code !== 'ENOENT') throw error;
 }
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'native-notebook-obsidian-'));const vault=path.join(root,'vault'),profile=path.join(root,'profile');
 const plugin=path.join(vault,'.obsidian/plugins/obsidian-ipynb');await fs.mkdir(plugin,{recursive:true});await fs.mkdir(profile);
 for(const name of ['main.js','manifest.json','styles.css','kernel_bridge.py'])await fs.copyFile(path.join('dist',name),path.join(plugin,name));
 const python=path.resolve('.venv/bin/python');await fs.writeFile(path.join(plugin,'data.json'),JSON.stringify({bridgePython:python,kernelPython:python}));
 await fs.writeFile(path.join(vault,'.obsidian/community-plugins.json'),JSON.stringify(['obsidian-ipynb']));await fs.writeFile(path.join(vault,'.obsidian/app.json'),JSON.stringify({showUnsupportedFiles:true}));
 await fs.writeFile(path.join(profile,'obsidian.json'),JSON.stringify({vaults:{testnotebook:{path:vault,ts:Date.now(),open:true}}}));
 await fs.writeFile(path.join(vault,'测试.ipynb'),JSON.stringify({nbformat:4,nbformat_minor:5,metadata:{},cells:[{id:'intro',cell_type:'markdown',source:'# Notebook',metadata:{}},{id:'one',cell_type:'code',source:'print("Obsidian 中运行成功")',metadata:{},outputs:[],execution_count:null}]}));
 console.log('Sandbox:',root);
 const {spawn}=require('node:child_process');
 const net=require('node:net');const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
 const child=spawn('/Applications/Obsidian.app/Contents/MacOS/Obsidian',[`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`],{stdio:['ignore','pipe','pipe']});
 let diagnostics='';child.stdout.on('data',c=>{diagnostics+=c});child.stderr.on('data',c=>{diagnostics+=c});
 let browser;
 try{
 let ready=false;const deadline=Date.now()+30000;
 while(Date.now()<deadline){try{await fetch(`http://127.0.0.1:${port}/json/version`);ready=true;break}catch{await new Promise(r=>setTimeout(r,100))}}
 if(!ready)throw new Error(`Obsidian CDP failed: ${diagnostics}`);
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
 let page=browser.contexts()[0].pages()[0];
 if(!page){await new Promise(resolve=>browser.contexts()[0].once('page',p=>{page=p;resolve()}))}
 await page.waitForLoadState('domcontentloaded');
 await page.waitForFunction(()=>window.app?.vault?.getAbstractFileByPath('测试.ipynb'),{timeout:30000});
 const trust=page.getByRole('button',{name:'Trust author and enable plugins',exact:true});if(await trust.isVisible())await trust.click();
 await page.waitForFunction(()=>window.app?.plugins?.plugins?.['obsidian-ipynb'],{timeout:30000});
 await page.evaluate(async()=>{const file=window.app.vault.getAbstractFileByPath('测试.ipynb');await window.app.workspace.getLeaf('tab').openFile(file)});
 assert.equal(await page.locator('.ipynb-cell').first().locator('.cm-editor').count(),0);
 await page.locator('.ipynb-markdown-preview').first().dblclick();
 await page.locator('.ipynb-cell').first().locator('.cm-content').press('Shift+Enter');
 assert.equal(await page.locator('.ipynb-cell').first().locator('.cm-editor').count(),0);
 await page.getByRole('button',{name:'运行单元格',exact:true}).waitFor();
 await page.getByRole('button',{name:'运行单元格',exact:true}).click();
 await page.locator('.ipynb-output').getByText('Obsidian 中运行成功',{exact:false}).waitFor({timeout:30000});
 await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByText('已保存',{exact:true}).waitFor();
 const saved=JSON.parse(await fs.readFile(path.join(vault,'测试.ipynb'),'utf8'));assert.equal(saved.cells[1].outputs[0].text,'Obsidian 中运行成功\n');
 await page.getByRole('button',{name:'添加代码',exact:true}).click();
 const second=page.locator('.ipynb-cell').nth(2);
 await second.locator('.cm-content').fill('from IPython.display import display, HTML\ndisplay(HTML("<table><tr><td>表格输出</td></tr></table><script>window.ipynbUnsafe = true</script>"))');
 await second.getByRole('button',{name:'运行单元格',exact:true}).click();
 await second.locator('table').getByText('表格输出').waitFor();
 assert.equal(await page.evaluate(()=>window.ipynbUnsafe),undefined);
 assert.equal(await second.locator('.ipynb-output script').count(),0);
 await page.getByRole('button',{name:'添加 Markdown',exact:true}).click();
 const third=page.locator('.ipynb-cell').nth(3);
 await third.locator('.cm-content').fill('# Notebook 内的说明');
 await third.hover();
 await third.getByRole('button',{name:'预览',exact:true}).click();
 await third.locator('h1').getByText('Notebook 内的说明').waitFor();
 await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByText('已保存',{exact:true}).waitFor();
 const edited=JSON.parse(await fs.readFile(path.join(vault,'测试.ipynb'),'utf8'));assert.equal(edited.cells.length,4);
 await fs.writeFile(path.join(vault,'测试.ipynb'),JSON.stringify({...edited,metadata:{external:true}}));
 await page.locator('.ipynb-cell').nth(1).locator('.cm-content').fill('print("编辑未覆盖外部文件")');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.locator('.ipynb-message').getByText('文件已在其他程序中修改',{exact:true}).waitFor();
 assert.equal(JSON.parse(await fs.readFile(path.join(vault,'测试.ipynb'),'utf8')).metadata.external,true);
 assert.equal(await page.locator('.ipynb-message details').getAttribute('open'),null);
 await page.locator('.ipynb-toolbar > details > summary').click();
 await page.getByRole('button',{name:'另存副本',exact:true}).click();
 assert.ok((await fs.readdir(vault)).some(name=>name.includes('副本')&&name.endsWith('.ipynb')));
 await page.screenshot({path:process.env.IPYNB_OBSIDIAN_SCREENSHOT||'/tmp/obsidian-ipynb-live.png',fullPage:true});console.log('PASS 独立 Obsidian：加载、编辑、真实运行、HTML表格与脚本过滤、Markdown单元格、保存、冲突保护与副本');
 }catch(error){const pages=browser?.contexts()[0]?.pages()??[];for(const p of pages)console.log((await p.locator('body').innerText()).slice(0,3500));throw error}
 finally{await browser?.close();child.kill('SIGTERM')}
})().catch(e=>{console.error(e);process.exitCode=1});
