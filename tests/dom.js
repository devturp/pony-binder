// Minimal DOM for module wiring tests. This does not simulate browser layout.
export function createDOM(){
  const nodes = new Map();
  class Element {
    constructor(attrs=''){
      this.attrs = attrs;
      this.dataset = Object.fromEntries([...attrs.matchAll(/data-([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
      this.listeners = {};
      this.classList = { add(){}, remove(){} };
      this.value = '';
      this.open = false;
      this.hidden = false;
      this._html = '';
    }
    set innerHTML(html){
      this._html = html;
      this.children = [...html.matchAll(/<([\w-]+)\b([^>]*)>/g)].map(m => {
        const node = new Element(m[2]);
        const id = /\bid="([^"]*)"/.exec(m[2]);
        if(id) nodes.set('#'+id[1], node);
        return node;
      });
      this.options = [...html.matchAll(/<option value="([^"]*)"/g)].map(m => ({ value:m[1] }));
    }
    get innerHTML(){ return this._html; }
    querySelectorAll(selector){
      return (this.children || []).filter(node => {
        if(selector.startsWith('.')) return (/(?:^|\s)class="([^"]*)"/.exec(node.attrs)?.[1] || '').split(' ').includes(selector.slice(1));
        const key = /^\[data-([\w-]+)\]$/.exec(selector)?.[1];
        return key && new RegExp('data-'+key+'(?:[=\\s]|$)').test(node.attrs);
      });
    }
    querySelector(selector){ return selector.startsWith('#') ? nodes.get(selector) : this.querySelectorAll(selector)[0]; }
    addEventListener(type, handler){ this.listeners[type] = handler; }
    showModal(){ this.open = true; }
    close(){ this.open = false; }
  }
  for(const id of ['profileArea','viewBanner','setTabs','rarity','status','stats','grid','count','q','shining','menuDlg','cardDlg','toast']) nodes.set('#'+id, new Element());
  const document = { body:new Element(), querySelector:selector => nodes.get(selector) || null };
  return { document, get:selector => nodes.get(selector), nodes };
}
