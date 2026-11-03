import {
  htmlPage,
  jsonForScript,
  oauthQuery,
} from "../packages/server-vercel/src/html.js";

export function GET(request: Request): Response {
  try {
    const query = oauthQuery(request);
    return htmlPage(
      "Connecting Goodreads MCP",
      `<h1>Connecting Goodreads</h1><p id="status">Creating a private connection for your library…</p><p class="note">No Goodreads password or session cookie is requested.</p>`,
      `const q=${jsonForScript(query)};const status=document.querySelector('#status');
      (async()=>{try{let response=await fetch('/api/auth/sign-in/anonymous',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
      if(!response.ok&&response.status!==422)throw new Error('Could not start a private session.');
      response=await fetch('/api/auth/oauth2/continue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({oauth_query:q})});
      const result=await response.json();if(!response.ok||!result.url)throw new Error(result.message||'Could not continue authorization.');location.assign(result.url)}catch(error){status.className='error';status.textContent=error.message}})();`,
    );
  } catch (error) {
    return htmlPage(
      "Invalid OAuth request",
      `<h1>Could not connect</h1><p class="error">${error instanceof Error ? error.message : "Invalid request."}</p>`,
      "",
      400,
    );
  }
}
