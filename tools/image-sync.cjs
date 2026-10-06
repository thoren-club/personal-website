const fs=require('fs'),path=require('path'),crypto=require('crypto');
let sharp;try{sharp=require('sharp');}catch{sharp=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp'));}
const site=path.resolve(__dirname,'..'),source=path.resolve(process.env.GALLERY_IMAGES_DIR||path.join(site,'images')),dist=path.join(site,'dist'),cachePath=path.join(site,'.gallery-runtime/cache.json');
function scan(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>{const f=path.join(folder,e.name);return e.isDirectory()?scan(f):/\.(png|jpe?g|webp|avif|tiff?)$/i.test(e.name)?[f]:[];}).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));}
function atomic(file,data){fs.writeFileSync(file+'.tmp',data);fs.renameSync(file+'.tmp',file);}
async function syncImages(){
 fs.mkdirSync(source,{recursive:true});fs.mkdirSync(path.dirname(cachePath),{recursive:true});fs.mkdirSync(path.join(dist,'assets'),{recursive:true});
 let previous={};try{previous=JSON.parse(fs.readFileSync(cachePath,'utf8'));}catch{}
 const next={},items=[],errors=[];
 for(const file of scan(source)){
  const relative=path.relative(source,file),stat=fs.statSync(file),stamp=`${stat.size}:${stat.mtimeMs}`;let cached=previous[relative];
  try{
   if(!cached||cached.stamp!==stamp||!fs.existsSync(path.join(dist,cached.item.image))||!fs.existsSync(path.join(dist,cached.item.thumb))){
    const hash=crypto.createHash('sha256').update(relative+stamp).digest('hex').slice(0,12),slug=path.basename(file,path.extname(file)).toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,60)||'image';
    const stem=`auto-${slug}-${hash}`,full=`assets/${stem}.webp`,thumb=`assets/${stem}-thumb.webp`,meta=await sharp(file).metadata();
    await sharp(file).rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toFile(path.join(dist,full));
    await sharp(file).rotate().resize({width:480,height:480,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toFile(path.join(dist,thumb));
    const swap=[5,6,7,8].includes(meta.orientation);
    cached={stamp,item:{title:path.basename(file,path.extname(file)),image:'./'+full,thumb:'./'+thumb,width:swap?meta.height:meta.width,height:swap?meta.width:meta.height}};
   }
   next[relative]=cached;items.push(cached.item);
  }catch(error){errors.push(`${relative}: ${error.message}`);}
 }
 atomic(path.join(dist,'images.js'),'window.GALLERY_IMAGES = '+JSON.stringify(items,null,2)+';\n');atomic(cachePath,JSON.stringify(next));
 const keep=new Set(items.flatMap(i=>[path.basename(i.image),path.basename(i.thumb)]));
 for(const file of fs.readdirSync(path.join(dist,'assets')))if(file.startsWith('auto-')&&!keep.has(file))fs.unlinkSync(path.join(dist,'assets',file));
 return {items,errors};
}
module.exports={syncImages,source,dist};
if(require.main===module)syncImages().then(r=>{console.log(`Gallery: ${r.items.length} images`);r.errors.forEach(console.error);}).catch(e=>{console.error(e);process.exitCode=1;});

