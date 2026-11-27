"use strict";

const CACHE_NAME = "mobile-care-receipt-v2";
const APP_SHELL = [
  "./index.html",
  "./styles.css",
  "./script.js",
  "./mcare.png",
  "./mcare-192.png",
  "./mcare-512.png",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) => name.startsWith("mobile-care-receipt-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  if (request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok && networkResponse.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) return cachedResponse;

      if (request.mode === "navigate") {
        const fallback = await caches.match("./index.html");
        if (fallback) return fallback;
      }
      return Response.error();
    }
  })());
});
