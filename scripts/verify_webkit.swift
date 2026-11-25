// Compile with swiftc and run on macOS while the local preview listens on port 5173.
import AppKit
import WebKit

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let config = WKWebViewConfiguration()
config.websiteDataStore = .nonPersistent()
config.userContentController.addUserScript(WKUserScript(source: """
window.__THREE_DEVTOOLS__=new EventTarget();
window.__THREE_DEVTOOLS__.addEventListener('observe',({detail:r})=>{
  if(!r.isWebGLRenderer)return;
  const render=r.render;
  r.render=function(scene,cam){
    const result=render.call(this,scene,cam);
    if(r.domElement.parentElement?.id==='scene')window.lastInteriorFrame={triangles:r.info.render.triangles,calls:r.info.render.calls};
    return result;
  }
});
""", injectionTime: .atDocumentStart, forMainFrameOnly: true))
let frame = NSRect(x: 0,y: 0,width: 390,height: 844)
let window = NSWindow(contentRect: frame,styleMask: [.borderless],backing: .buffered,defer: false)
let web = WKWebView(frame: frame,configuration: config)
window.contentView = web
window.orderBack(nil)

@MainActor func read(_ js: String) async throws -> Any {
    return try await web.callAsyncJavaScript(js, arguments: [:], in: nil, contentWorld: .page) as Any
}

@MainActor func exercise() async throws -> [String:Any] {
    func go(_ query:String) async throws {
        web.load(URLRequest(url:URL(string:"http://127.0.0.1:5173/experience"+query)!))
        try await Task.sleep(nanoseconds: 700_000_000)
    }
    try await go("?wing=A&floor=17&light=evening")
    let exterior = try await read("""
    const deadline=performance.now()+25000;
    while(!document.querySelector('#estatePanelContent button') || document.querySelector('#estateStatus')?.textContent.includes('Preparing')){
      if(performance.now()>deadline)break;
      await new Promise(r=>setTimeout(r,120));
    }
    const canvas=document.querySelector('#estateCanvas canvas'),gl=canvas?.getContext('webgl2');
    const floor=document.querySelector('#estatePanelContent [aria-label="Floor 17"]');
    const btn=document.querySelector('#panelClose'),reopen=document.querySelector('#reopenPanel');
    const metrics=(await import('/estate-scene.js')).sceneMetrics();
    const result={triangles:metrics?.triangles,drawCalls:metrics?.drawCalls,gpu:gl?.getParameter(gl.RENDERER),url:location.search,title:document.querySelector('#estatePanelTitle')?.textContent,ua:navigator.userAgent,
      status:document.querySelector('#estateStatus')?.textContent,selectedFloor:floor?.getAttribute('aria-pressed'),
      evening:document.querySelector('#estateLight')?.getAttribute('data-mood'),webgl2:!!gl&&!gl.isContextLost(),canvasSize:canvas?[canvas.width,canvas.height]:[],
      width:innerWidth,height:innerHeight,noOverflow:document.documentElement.scrollWidth<=innerWidth};
    btn?.click();result.collapsed=reopen?.hidden===false;reopen?.click();result.reopened=!document.querySelector('#estatePanel')?.hidden;
    return result;
    """)
    try await go("?layout=A3&room=kitchen")
    let interior = try await read("""
    const deadline=performance.now()+25000;
    while(!document.body.classList.contains('walking')||!window.lastInteriorFrame?.triangles){
       if(performance.now()>deadline)break;
       await new Promise(r=>setTimeout(r,120));
    }
    const canvas=document.querySelector('#scene canvas'),gl=canvas?.getContext('webgl2');
    const r={triangles:window.lastInteriorFrame?.triangles,drawCalls:window.lastInteriorFrame?.calls,url:location.search,room:document.querySelector('#roomName')?.textContent,status:document.querySelector('#sceneStatus')?.textContent,
      webgl2:!!gl&&!gl.isContextLost(),fallback:document.body.classList.contains('rendered-fallback')};
    document.querySelector('#planButton')?.click();
    const planEnd=performance.now()+6000;
    while(!document.querySelector('#planDialog')?.open && performance.now()<planEnd)await new Promise(resolve=>setTimeout(resolve,80));
    r.planOpened=document.querySelector('#planDialog')?.open;
    return r;
    """)
    try await go("?amenity=sky-deck")
    let amenity = try await read("""
    const end=performance.now()+24000,wait=ms=>new Promise(r=>setTimeout(r,ms));
    while((!document.querySelector('#amenity-legend-sky-deck')||!(await import('/estate-scene.js')).sceneMetrics()?.triangles)&&performance.now()<end)await wait(120);
    const sel=document.querySelector('#amenity-legend-sky-deck');
    if(!sel)throw Error('Sky deck legend unavailable');
    sel.value='sky-deck-13';sel.dispatchEvent(new Event('change',{bubbles:true}));
    const eye=[...document.querySelectorAll('.amenity-actions button')].find(b=>b.textContent==='Eye-level view');eye.click();
    const walk=[...document.querySelectorAll('.amenity-walk button')].find(b=>b.textContent==='Step forward');walk.click();
    await wait(1500);
    const m=(await import('/estate-scene.js')).sceneMetrics();
    return {triangles:m?.triangles,drawCalls:m?.drawCalls,eyeCamera:m?.camera,selected:document.querySelector('#amenity-legend-sky-deck')?.value,walk:true};
    """)
    return ["runtime":"System WKWebView","exterior":exterior,"interior":interior,"amenity":amenity]
}

Task { @MainActor in
    do {
      let result=try await exercise()
      let data=try JSONSerialization.data(withJSONObject:result,options:[.prettyPrinted,.sortedKeys])
      print(String(data:data,encoding:.utf8)!)
      exit(0)
    } catch {print(String(describing:error));exit(1)}
}
app.run()
