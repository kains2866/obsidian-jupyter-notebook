import {it,expect,vi} from 'vitest';
import {EditorState} from '@codemirror/state';
import {showTooltip} from '@codemirror/view';
const math=vi.hoisted(()=>({load:vi.fn(),render:vi.fn(),finish:vi.fn(async()=>{})}));
vi.mock('obsidian',()=>({loadMathJax:math.load,renderMath:math.render,finishRenderMath:math.finish}));
import {mathPreviewExtension} from '../src/math-preview-extension';
function tooltip(){
 const state=EditorState.create({doc:'$x$',selection:{anchor:3},extensions:[mathPreviewExtension()]});
 const dom={hidden:false,className:'',textContent:'',replaceChildren:vi.fn()};
 const view:any={dom:{ownerDocument:{createElement:()=>dom}},hasFocus:true,requestMeasure:vi.fn()};
 const spec=state.facet(showTooltip).flat().filter(Boolean)[0]!;
 return {instance:spec.create(view),dom,view};
}
it('waits for MathJax before rendering and measuring the tooltip',async()=>{
 let ready!:()=>void;math.load.mockImplementation(()=>new Promise<void>(resolve=>ready=resolve));math.render.mockReset().mockReturnValue({});math.finish.mockClear();
 const s=tooltip();s.instance.mount!({} as any);expect(math.render).not.toHaveBeenCalled();ready();await vi.waitFor(()=>expect(s.view.requestMeasure).toHaveBeenCalled());expect(math.render).toHaveBeenCalledWith('x',false);expect(s.dom.replaceChildren).toHaveBeenCalled();
});
it('does not render or measure a tooltip destroyed while MathJax is loading',async()=>{
 let ready!:()=>void;math.load.mockImplementation(()=>new Promise<void>(resolve=>ready=resolve));math.render.mockClear();const s=tooltip();s.instance.mount!({} as any);s.instance.destroy!();ready();await Promise.resolve();await Promise.resolve();expect(math.render).not.toHaveBeenCalled();expect(s.view.requestMeasure).not.toHaveBeenCalled();
});
