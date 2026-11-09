// Turns a DEAP dwelling report PDF into lines of text with column gaps kept (2+ spaces between columns).
// Works in the browser (window.pdfjsLib) and in node for tests.
(function(g){
async function pdfLines(pdfjs, data){
  const doc = await pdfjs.getDocument({data, isEvalSupported:false, disableFontFace:true}).promise;
  const out = [];
  for(let p=1;p<=doc.numPages;p++){
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter(it=>it.str && it.str.trim()!=='').map(it=>({x:it.transform[4], y:it.transform[5], w:it.width, s:it.str, h:Math.abs(it.transform[3])||8}));
    items.sort((a,b)=>b.y-a.y || a.x-b.x);
    const rows=[];
    for(const it of items){
      let r = rows.find(r=>Math.abs(r.y-it.y)<2.2);
      if(!r){ r={y:it.y, items:[]}; rows.push(r); }
      r.items.push(it);
    }
    rows.sort((a,b)=>b.y-a.y);
    for(const r of rows){
      r.items.sort((a,b)=>a.x-b.x);
      let text='', end=null; const cells=[];
      for(const it of r.items){
        const gap = end===null ? 0 : it.x-end;
        if(end!==null){
          if(gap > 6) { text += '   '; cells.push({x:it.x, s:it.s}); }
          else { if(gap > 1 && !text.endsWith(' ') && !it.s.startsWith(' ')) text+=' '; cells[cells.length-1].s += (gap>1?' ':'')+it.s; }
        } else cells.push({x:it.x, s:it.s});
        text += it.s; end = it.x + it.w;
      }
      out.push({page:p, y:r.y, text:text.replace(/\s+$/,''), cells:cells.map(c=>({x:c.x,s:c.s.trim()}))});
    }
  }
  return out;
}
g.pdfLines = pdfLines;
if(typeof module!=='undefined') module.exports = {pdfLines};
})(typeof window!=='undefined'?window:globalThis);
