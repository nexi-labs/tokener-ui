// Checks every use case: scenes build (icons and node ids resolve), systems resolve, pipelines link and validate, template ids exist.
const path=require("path"),fs=require("fs");
const UI=process.env.UI_DIR||path.resolve(__dirname,"..");
const root=UI+"/src";
const sucrase=require(UI+"/node_modules/sucrase");
global.React=require(UI+"/node_modules/react"); // sucrase compiles JSX to React.createElement, and some modules reached from the use case data import components
const Module=require("module");
const orig=Module._resolveFilename;
Module._resolveFilename=function(req,...a){ if(req.startsWith("@/")) req=path.join(root,req.slice(2)); return orig.call(this,req,...a); };
for(const ext of [".ts",".tsx"]) require.extensions[ext]=(m,f)=>{ m._compile(sucrase.transform(fs.readFileSync(f,"utf8"),{transforms:["typescript","imports","jsx"],filePath:f}).code,f); };
const {USE_CASES}=require(root+"/lib/usecases/index.ts");
const {buildScene}=require(root+"/lib/usecases/scene.ts");
const {brandOf}=require(root+"/lib/industry-brands.ts");
const {INDUSTRY_CONTENT}=require(root+"/lib/industry-content.ts");
const {INDUSTRY_FLOWS}=require(root+"/lib/industry-flows.ts");
const {buildUseCaseSpec}=require(root+"/lib/mlops/usecase-templates.ts");
const {validateSpec}=require(root+"/lib/mlops/spec.ts");
const {PIPELINES}=require(root+"/lib/usecases/pipelines.ts");
let bad=0; const say=(...a)=>{bad++;console.log(...a)};
const dash=/[—–]/;
const slugs=new Set();
for(const u of USE_CASES){
  if(slugs.has(u.slug)) say("DUP",u.slug); slugs.add(u.slug);
  try{buildScene(u.slug,u.scene)}catch(e){say("SCENE",u.slug,e.message)}
  for(const s of u.systems){try{brandOf(s)}catch(e){say("SYSTEM",u.slug,s)}}
  if(u.steps.length<4) say("STEPS",u.slug);
  const text=JSON.stringify(u); if(dash.test(text)) say("DASH",u.slug);
  if(!["knowledge",...Object.keys(INDUSTRY_CONTENT)].includes(u.industry)) say("INDUSTRY",u.slug,u.industry);
  if(PIPELINES[u.slug]){
    try{
      const spec=buildUseCaseSpec(u.slug);
      const issues=validateSpec(spec,{connections:[],agents:[]}).filter(i=>i.level==="error");
      const other=issues.filter(i=>!/connection|Connection|build agent/.test(i.msg));
      if(other.length) say("VALIDATE",u.slug,other.map(i=>i.msg).slice(0,4));
    }catch(e){say("PIPE",u.slug,e.message)}
  }
}
for(const [k,c] of Object.entries(INDUSTRY_CONTENT)){
  if(!USE_CASES.find(u=>u.slug===c.flagship)) say("FLAGSHIP",k,c.flagship);
  for(const g of c.systems) for(const n of g.names){try{brandOf(n)}catch(e){say("INDSYS",k,n)}}
  if(dash.test(JSON.stringify(c))) say("DASH industry",k);
  if(!INDUSTRY_FLOWS.find(f=>f.slug===k)) say("NOFLOW",k);
}
for(const f of INDUSTRY_FLOWS) if(dash.test(JSON.stringify(f))) say("DASH flow",f.slug);
console.log("use cases:",USE_CASES.length,"problems:",bad);
