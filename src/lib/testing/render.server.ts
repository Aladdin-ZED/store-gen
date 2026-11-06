import "server-only";
/**
 * The test render (P3 LANDING; landing.md LAN-§14.2; docs/STORE-SAAS.md D54): a published page opened with a valid
 * `?sg-test=<token>` renders on request without pixels, with the `?sg-test=` endpoints and thank-you URL, without
 * `endpoints.event`, with the test band. The body is the maintainer's (src/lib/render/test-render.server.ts, called by
 * T3's store routes); this module re-exports it as the landing part's name for it.
 */
export { renderTestDocument, TEST_PARAM } from "@/lib/render/test-render.server";
