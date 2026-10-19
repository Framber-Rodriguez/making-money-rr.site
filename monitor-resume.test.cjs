const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function page(storage=new Map()){
 const events={},nodes={pair:{value:'XAUUSD',options:[{value:'XAUUSD'},{value:'BINANCE:BNBUSDT'}]},tf:{value:'5 minutes',options:[{value:'5 minutes'},{value:'1 minute'}]},live:{disabled:false}};
 let id='owner',allowed=false,starts=0;
 const window={MMAuth:{userId:()=>id,signedIn:()=>allowed},addEventListener(n,f){(events[n]||=[]).push(f)},dispatchEvent(e){for(const f of events[e.type]||[])f(e)}};
 for(const n of Object.values(nodes))n.dispatchEvent=()=>{};
 nodes.live.click=()=>{assert.equal(allowed,true);nodes.live.disabled=true;starts++;window.dispatchEvent({type:'mmstart'});};
 vm.runInNewContext(fs.readFileSync(__dirname+'/monitor-resume.js','utf8'),{window,document:{getElementById:id=>nodes[id]},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},Event:class{constructor(type){this.type=type}}});
 return {window,nodes,storage,get starts(){return starts},emit(type,detail){window.dispatchEvent({type,detail})},access(value,user=id){allowed=value;id=user;this.emit('mmaccess')}};
}
test('reload resumes the saved market only after access is verified, once',()=>{
 const a=page();a.access(true);a.nodes.pair.value='BINANCE:BNBUSDT';a.nodes.tf.value='1 minute';a.nodes.live.click();a.emit('mmstop',{remember:false});
 const b=page(a.storage);b.access(false);assert.equal(b.starts,0);b.access(true);assert.equal(b.starts,1);assert.equal(b.nodes.pair.value,'BINANCE:BNBUSDT');assert.equal(b.nodes.tf.value,'1 minute');b.access(true);assert.equal(b.starts,1);
});
test('explicit pause stays paused after reload and account preferences do not leak',()=>{
 const a=page();a.access(true);a.nodes.live.click();a.emit('mmstop',{remember:true});const b=page(a.storage);b.access(true);assert.equal(b.starts,0);
 a.nodes.live.click();const c=page(a.storage);c.access(true,'other-account');assert.equal(c.starts,0);
});
test('unknown saved markets and malformed storage never start monitoring',()=>{
 for(const value of ['{broken',JSON.stringify({active:true,pair:'UNSUPPORTED',timeframe:'5 minutes'})]){const p=page(new Map([['mm-monitor-v1:owner',value]]));p.access(true);assert.equal(p.starts,0);}
});
test('Safari back-forward restoration reconnects after pagehide cleanup',()=>{
 const p=page();p.access(true);p.nodes.live.click();p.emit('mmstop',{remember:false});p.nodes.live.disabled=false;p.window.dispatchEvent({type:'pageshow',persisted:true});assert.equal(p.starts,2);
});
