// Theme only the already-sanitized sandboxed email document. Source and images stay intact.
const sources=new WeakMap();
const darkStyle=`<style data-campus-mail-appearance>
:root{color-scheme:dark;background:#1b1e25;color:#e4e9f3}
html,body{background:#1b1e25!important;color:#e4e9f3!important}
body :is(div,p,span,table,tbody,thead,tfoot,tr,td,th,section,article,header,footer,main,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,code,b,strong,i,em,small,font){background-color:transparent!important;color:#e4e9f3!important;border-color:#475062!important}
body a,body a *{color:#b3ceff!important}
body blockquote{border-left-color:#758ab0!important;color:#bac6da!important}
body :is(pre,code){background-color:#252c38!important}
body th{background-color:#252c38!important}
::selection{background:#475d8d;color:#fff}
</style>`;
export function mailDocumentAppearance(html,theme){
 if(theme!=='dark'&&theme!=='retro')return html;
 const style=theme==='retro'?darkStyle.replaceAll('#1b1e25','#282b25').replaceAll('#e4e9f3','#cfd2c4').replaceAll('#475062','#464b41').replaceAll('#b3ceff','#d4c292').replaceAll('#758ab0','#7b806c').replaceAll('#bac6da','#b5bcaa').replaceAll('#252c38','#343830').replaceAll('#475d8d','#555f4b').replace('</style>','body{font:12px/1.78 Arial,Helvetica,sans-serif}</style>'):darkStyle;
 const source=String(html||'');
 return /<\/head\s*>/i.test(source)?source.replace(/<\/head\s*>/i,style+'</head>'):style+source;
}
export function setMailDocument(frame,html){
 sources.set(frame,html);
 frame.srcdoc=mailDocumentAppearance(html,document.body.dataset.theme);
}
export function watchMailAppearance(){
 if(typeof MutationObserver==='undefined')return;
 let theme=document.body.dataset.theme;
 const observer=new MutationObserver(()=>{
  if(document.body.dataset.theme===theme)return;
  theme=document.body.dataset.theme;
  for(const frame of document.querySelectorAll('.mail-frame'))if(sources.has(frame))frame.srcdoc=mailDocumentAppearance(sources.get(frame),document.body.dataset.theme);
 });
 observer.observe(document.body,{attributes:true,attributeFilter:['data-theme']});
}
