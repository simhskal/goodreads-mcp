import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import {
  escapeHtml,
  htmlPage,
  jsonForScript,
  oauthQuery,
} from "../packages/server-vercel/src/html.js";

export async function GET(request: Request): Promise<Response> {
  try {
    const query = oauthQuery(request);
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret || !(await verifyOAuthQueryParams(query, secret)))
      throw new Error("The OAuth request is invalid or expired.");
    return htmlPage(
      "Authorize Goodreads MCP",
      `<h1>Let your MCP client use this library?</h1><div class="card"><p>It will be able to:</p><p class="scope">library:read</p><p>Read your connected shelves and imported history.</p><p class="scope">account:write</p><p>Delete the Goodreads data stored for this connection.</p><button id="approve">Authorize</button><p id="message" aria-live="polite"></p></div>`,
      `const q=${jsonForScript(query)};const button=document.querySelector('#approve');const message=document.querySelector('#message');button.addEventListener('click',async()=>{button.disabled=true;try{const response=await fetch('/api/auth/oauth2/consent',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accept:true,oauth_query:q})});const result=await response.json();if(!response.ok||!result.url)throw new Error(result.message||'Authorization failed.');location.assign(result.url)}catch(error){message.className='error';message.textContent=error.message;button.disabled=false}});`,
    );
  } catch (error) {
    return htmlPage(
      "Invalid OAuth request",
      `<h1>Could not authorize</h1><p class="error">${escapeHtml(error instanceof Error ? error.message : "Invalid request.")}</p>`,
      "",
      400,
    );
  }
}
