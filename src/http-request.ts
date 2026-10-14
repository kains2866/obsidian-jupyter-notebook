import {requestUrl} from 'obsidian';

/** Obsidian's CORS-free transport has no abort API; cancellation discards its result promptly. */
export const requestAsFetch:typeof window.fetch=async(input,options)=>{
 const signal=options?.signal;
 if(signal?.aborted)throw new Error('Request canceled');
 const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 let cancel:()=>void=()=>{};
 const canceled=new Promise<never>((_resolve,reject)=>{cancel=()=>reject(new Error('Request canceled'));signal?.addEventListener('abort',cancel,{once:true})});
 try{
  const response=await Promise.race([requestUrl({url,method:options?.method??'GET',throw:false}),canceled]);
  if(signal?.aborted)throw new Error('Request canceled');
  return new Response(response.arrayBuffer,{status:response.status,headers:response.headers});
 }finally{signal?.removeEventListener('abort',cancel)}
};
