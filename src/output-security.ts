// Applied to the detached result of Obsidian's sanitizer, never to raw HTML.
// Notebook output is static: no active embeds, widgets, remote auto-loads or CSS sheets.
const STATIC_TAGS=new Set(('a abbr b bdi bdo blockquote br caption code col colgroup dd del details div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img ins kbd li mark ol p pre q rp rt ruby s samp small span strong sub summary sup table tbody td tfoot th thead time tr u ul var wbr svg g defs title desc path rect circle ellipse line polyline polygon text tspan use symbol clippath mask lineargradient radialgradient stop pattern image').split(' '));
const STATIC_ATTRIBUTES=new Set(('id class title alt role aria-label aria-hidden aria-describedby aria-labelledby dir lang width height colspan rowspan scope start reversed open align valign border cellpadding cellspacing viewbox preserveaspectratio d x y x1 y1 x2 y2 cx cy r rx ry points transform dx dy rotate textlength lengthadjust font-family font-size font-style font-weight text-anchor dominant-baseline fill-rule clip-rule stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity fill-opacity stroke-opacity offset stop-color stop-opacity gradientunits gradienttransform spreadmethod patternunits patterncontentunits patterntransform markerwidth markerheight refx refy orient').split(' '));
const PAINT_ATTRIBUTES=new Set(['fill','stroke','clip-path','mask','filter']);
const STATIC_STYLES=new Set(('color background-color font-family font-size font-style font-weight text-align text-decoration white-space vertical-align border border-color border-width border-style border-collapse padding padding-left padding-right padding-top padding-bottom margin margin-left margin-right margin-top margin-bottom width height max-width max-height fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset fill-opacity stroke-opacity opacity text-anchor').split(' '));
const localReference=(value:string)=>/^#[\w:.-]+$/.test(value);
const rasterData=(value:string)=>/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/=\s]+$/i.test(value);
const paintValue=(value:string)=>/^url\(\s*#[\w:.-]+\s*\)$/.test(value)||/^[\w\s#.,%+-]+$/.test(value)||/^(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)$/i.test(value);
function navigation(value:string):boolean{
 if(!value||Array.from(value).some(character=>character.charCodeAt(0)<=32||(character.charCodeAt(0)>=127&&character.charCodeAt(0)<=159)||character==='\\')||value.startsWith('//'))return false;
 return /^(?:https?:|mailto:)/i.test(value)||!value.split(/[/?#]/,1)[0].includes(':');
}
function staticStyle(value:string):string{
 return value.split(';').flatMap(declaration=>{const colon=declaration.indexOf(':');if(colon<0)return [];const name=declaration.slice(0,colon).trim().toLowerCase(),content=declaration.slice(colon+1).trim();return STATIC_STYLES.has(name)&&paintValue(content)?[`${name}: ${content}`]:[]}).join('; ');
}
/** Strip active content and implicit network requests from already sanitized output. */
export function hardenOutputDom(root:ParentNode):void{
 for(const element of Array.from(root.children)){
  const tag=element.localName.toLowerCase();if(!STATIC_TAGS.has(tag)){element.remove();continue}
  for(const attribute of Array.from(element.attributes)){
   const name=attribute.name.toLowerCase(),value=attribute.value;
   if(name==='style'){const style=staticStyle(value);if(style)element.setAttribute('style',style);else element.removeAttribute(attribute.name);continue}
   if(name==='href'||name==='xlink:href'){
    const allowed=tag==='a'?navigation(value):(tag==='use'?localReference(value):tag==='image'&&rasterData(value));
    if(!allowed)element.removeAttribute(attribute.name);continue;
   }
   if(name==='src'){if(tag!=='img'||!rasterData(value))element.removeAttribute(attribute.name);continue}
   if(PAINT_ATTRIBUTES.has(name)){if(!paintValue(value))element.removeAttribute(attribute.name);continue}
   if(!STATIC_ATTRIBUTES.has(name))element.removeAttribute(attribute.name);
  }
  if(tag==='a'){element.setAttribute('rel','noopener noreferrer');element.setAttribute('target','_blank')}
  hardenOutputDom(element);
 }
}
