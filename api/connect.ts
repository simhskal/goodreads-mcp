import {
  auth,
  cleanRssKey,
  encryptCredential,
  escapeHtml,
  getPool,
  htmlPage,
  jsonForScript,
  LibraryRepository,
  oauthQuery,
  parseGoodreadsCsv,
  parseGoodreadsIdentity,
} from "../packages/server-vercel/src/index.js";

export async function GET(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });
  try {
    const query = oauthQuery(request);
    return connectPage(query);
  } catch (error) {
    return connectPage(
      "",
      error instanceof Error ? error.message : "Invalid request.",
      400,
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await request.formData();
    const identity = parseGoodreadsIdentity(String(form.get("profile") ?? ""));
    const rssKey = cleanRssKey(String(form.get("rss_key") ?? ""));
    const repository = new LibraryRepository(getPool());
    await repository.saveProfile(
      session.user.id,
      identity.userId,
      identity.profileUrl,
      rssKey ? encryptCredential(rssKey) : undefined,
    );
    const csv = form.get("library");
    if (csv instanceof File && csv.size) {
      if (csv.size > 10_000_000)
        throw new Error("CSV exports must be no larger than 10 MB.");
      await repository.importBooks(
        session.user.id,
        parseGoodreadsCsv(await csv.text()),
      );
    }
    return Response.json({ connected: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not connect Goodreads.",
      },
      { status: 400 },
    );
  }
}

function connectPage(query: string, error?: string, status = 200): Response {
  return htmlPage(
    "Connect Goodreads",
    `<h1>Connect your Goodreads library</h1><p>Add your profile and optional RSS key. Your password and cookies stay with Goodreads.</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
    <form id="connect" class="card" enctype="multipart/form-data">
      <label>Profile URL or user ID<input name="profile" required placeholder="https://www.goodreads.com/user/show/12345"></label>
      <label>RSS key (optional)<input name="rss_key" autocomplete="off"></label>
      <p class="note">Find it at My Books → a shelf → RSS. It is encrypted before storage.</p>
      <label>Library CSV (optional)<input name="library" type="file" accept=".csv,text/csv"></label>
      <button type="submit">Connect Goodreads</button><p id="message" aria-live="polite"></p>
    </form>`,
    query
      ? `const q=${jsonForScript(query)};const form=document.querySelector('#connect');const button=form.querySelector('button');const message=document.querySelector('#message');
    form.addEventListener('submit',async(event)=>{event.preventDefault();button.disabled=true;message.textContent='Saving…';try{
    let response=await fetch('/connect',{method:'POST',body:new FormData(form)});let result=await response.json();if(!response.ok)throw new Error(result.error||'Could not save your library.');
    response=await fetch('/api/auth/oauth2/continue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({postLogin:true,oauth_query:q})});result=await response.json();if(!response.ok||!result.url)throw new Error(result.message||'Could not continue authorization.');location.assign(result.url)
    }catch(error){message.className='error';message.textContent=error.message;button.disabled=false}});`
      : "",
    status,
  );
}
