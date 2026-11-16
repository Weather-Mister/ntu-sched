import {unzipSync,strFromU8} from 'fflate';
import {getDocumentProxy} from 'unpdf';
import {documentFrom} from './portfolio-html.mjs';
import {ApiError} from './security.mjs';

export const MAX_DOCUMENT_BYTES=8*1024*1024;
export function htmlContent(html){
 const doc=documentFrom('<html><body>'+String(html||'')+'</body></html>');
 doc.querySelectorAll('script,style,iframe,object,template').forEach(e=>e.remove());
 const links=[...doc.querySelectorAll('a[href]')].map(e=>({title:e.textContent.trim(),url:e.getAttribute('href')}));
 doc.querySelectorAll('p,div,br,li,tr,h1,h2,h3,h4').forEach(e=>e.append('\n'));
 return {text:(doc.body.textContent||'').replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim(),links};
}
export async function documentText(bytes,name,mime=''){
 if(bytes.byteLength>MAX_DOCUMENT_BYTES)throw new ApiError(413,'report_document_large','This document exceeds the 8 MiB reading limit. Open the source to review it.');
 const lower=String(name).toLowerCase();
 if(lower.endsWith('.pdf')||mime.includes('pdf')){
  const pdf=await getDocumentProxy(bytes,{isEvalSupported:false,useSystemFonts:false,disableFontFace:true,maxImageSize:1,verbosity:0});
  try{
   if(pdf.numPages>150)throw new ApiError(413,'report_document_long','This PDF exceeds the 150-page reading limit.');
   const pages=[],links=[],visualReviewPages=[];let length=0;
   for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i),content=await page.getTextContent();
    const text=content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('');length+=text.length;
    if(length>300000)throw new ApiError(413,'report_document_long','This document exceeds the text reading limit.');
    pages.push(text);if(text.trim().length<15)visualReviewPages.push(i);for(const a of await page.getAnnotations())if(a.url)links.push({title:'PDF link',url:a.url});
    page.cleanup();
   }
   const text=pages.join('\n\n').trim();
   return {text,links,pages:pdf.numPages,visualReviewPages,needsVisualReview:visualReviewPages.length>0};
  }finally{await pdf.loadingTask.destroy();}
 }
 if(/\.(docx|pptx|xlsx)$/.test(lower)){
  let expanded=0,blocked=false;
  const files=unzipSync(bytes,{filter(file){
   if(!/^(word\/(document|header\d+|footer\d+)\.xml|ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+)\.xml|xl\/(sharedStrings|worksheets\/sheet\d+)\.xml|.*\.rels)$/.test(file.name))return false;
   expanded+=file.originalSize;if(expanded>4*1024*1024){blocked=true;return false;}return true;
  }});
  if(blocked)throw new ApiError(413,'report_document_large','The expanded document exceeds the reading limit.');
  const text=[],links=[];
  for(const name of Object.keys(files).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))){
   const xml=strFromU8(files[name]);
   if(name.endsWith('.rels')){const doc=documentFrom(xml);for(const el of doc.querySelectorAll('Relationship,relationship'))if((el.getAttribute('TargetMode')||el.getAttribute('targetmode'))==='External')links.push({title:'Document link',url:el.getAttribute('Target')||el.getAttribute('target')});continue;}
   // Preserve paragraph, table-row and cell boundaries, including Chinese text.
   const html=xml.replace(/<\/(?:w:p|a:p|row|w:tr)>/g,'\n').replace(/<\/(?:w:tc|c)>/g,'\t').replace(/<[^>]*>/g,'');
   text.push(htmlContent(html).text);
  }
  const combined=text.join('\n').trim();return {text:combined,links,needsVisualReview:!combined};
 }
 if(mime.startsWith('text/')||/\.(txt|csv|tsv|md|html?)$/.test(lower)){
  const text=new TextDecoder().decode(bytes);
  return mime.includes('html')||/\.html?$/.test(lower)?htmlContent(text):{text,links:[]};
 }
 return {text:'',links:[],needsVisualReview:true,unsupported:true};
}
