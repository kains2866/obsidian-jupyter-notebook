import {it,expect} from 'vitest';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import ts from 'typescript';
import {createTranslator} from '../src/i18n';
const sourceDirectory=join(import.meta.dirname,'../src');
const parse=(name:string)=>ts.createSourceFile(name,readFileSync(join(sourceDirectory,name),'utf8'),ts.ScriptTarget.Latest,true);
const chinese=/[\u4e00-\u9fff]/;
const exclusions=new Set(['中文','[Obsidian Jupyter Notebook] 属性索引失败']);
it('covers every Chinese source literal except the native language label and console diagnostic',()=>{
 const missing:string[]=[];const en=createTranslator('en');
 for(const name of readdirSync(sourceDirectory).filter(name=>name.endsWith('.ts')&&!name.includes('translations')&&name!=='i18n.ts')){
  const file=parse(name);const visit=(node:ts.Node):void=>{
   if((ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))&&chinese.test(node.text)&&!exclusions.has(node.text)&&en(node.text)===node.text)missing.push(`${name}: ${node.text}`);
   ts.forEachChild(node,visit);
  };visit(file);
 }expect(missing).toEqual([]);
});
it('covers plugin-authored English Error literals and parameterized error templates',()=>{
 const zh=createTranslator('zh');const missing:string[]=[];
 for(const name of readdirSync(sourceDirectory).filter(name=>name.endsWith('.ts')&&!name.includes('translations')&&name!=='i18n.ts')){
  const file=parse(name);const visit=(node:ts.Node):void=>{
   if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='Error'){
    const argument=node.arguments?.[0];if(argument){
     const check=(value:ts.Node):void=>{
      if(ts.isStringLiteral(value)||ts.isNoSubstitutionTemplateLiteral(value)){if(!chinese.test(value.text)&&/[A-Za-z]{3}/.test(value.text)&&zh(value.text)===value.text)missing.push(`${name}: ${value.text}`)}
      else if(ts.isTemplateExpression(value)){
       const literal=value.head.text+value.templateSpans.map(span=>span.literal.text).join('');if(!chinese.test(literal)&&!/[A-Za-z]{3}/.test(literal))return;
       const text=value.head.text+value.templateSpans.map(span=>'sample'+span.literal.text).join('');
       if(chinese.test(text)?createTranslator('en')(text)===text:zh(text)===text)missing.push(`${name}: ${text}`);
      }else if(ts.isBinaryExpression(value)) {check(value.left);check(value.right)}
     };check(argument);
    }
   }ts.forEachChild(node,visit);
  };visit(file);
 }expect(missing).toEqual([]);
});
