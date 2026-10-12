// Keep the installed app connected to the same live data and auth behavior as
// the website. No private pages or API responses are cached for offline use.
self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET") {
    event.respondWith(fetch(event.request));
  }
});
