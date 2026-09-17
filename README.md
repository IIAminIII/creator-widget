# Deal Response Widget

A custom, externally hosted React form widget for Zoho Creator. It replaces the native Creator form UI with a polished, fully controlled form and writes submissions into the existing Creator form **Deal Response Form**.

- React + Vite + TypeScript, plain CSS, Lucide icons
- Runs standalone on `http://localhost:5173` in mock mode
- Deployable to Vercel as a static site with no architectural changes
- All Zoho Creator SDK calls are isolated in `src/services/creatorService.ts`

---

## Quick start (mock mode)

```bash
npm install
cp .env.example .env   # already contains VITE_USE_CREATOR_MOCK=true
npm run dev
```

Open:

```
http://localhost:5173/?CRM_Deal_ID=TEST123
```

Submissions are simulated with a short delay, logged to the browser console, and a fake record ID such as `MOCK_123456` is returned. Nothing is sent to Zoho.

Open `http://localhost:5173/` **without** the parameter to see the "Deal reference is missing" error screen.

```bash
npm run build     # type-checks and builds to dist/
npm run preview   # serves the production build on :5173
```

---

## How it works

| UI element             | Creator field      |
| ---------------------- | ------------------ |
| Response textarea      | `Response_Text`    |
| Response choice cards  | `Response_Choice`  |
| Selected file          | `Upload_File`      |
| `CRM_Deal_ID` URL param| `CRM_Deal_ID`      |

`CRM_Sync_Status` and `CRM_Sync_Message` are backend-only fields and are never touched by the widget.

`Response_Choice` values are sent exactly as `Approved`, `Needs Changes`, or `Rejected`.

### Submission flow

1. Validate response text (required, trimmed, min 3 chars), choice, and file (`.pdf .doc .docx .jpg .jpeg .png`, max 10 MB).
2. Verify `CRM_Deal_ID` is present.
3. Disable all inputs; the button shows a spinner and "Submitting...".
4. `createDealResponseRecord()` creates the Creator record with `Response_Text`, `Response_Choice`, `CRM_Deal_ID`.
5. `uploadDealResponseFile(recordId, file)` uploads the file into the same record's `Upload_File` field.
6. Success screen is shown. No page reload.

If step 4 fails: "Unable to submit your response. Please try again."
If step 5 fails: "Your response was created, but the file could not be uploaded. Please contact support."

### Project structure

```
src/
  components/      Pure UI (no Zoho code)
  hooks/           useDealResponseForm - state, validation, submit orchestration
  services/        creatorService.ts - the ONLY place that talks to ZOHO.CREATOR
  utils/           file validation, size formatting, URL param parsing
  types/           shared types and the Creator payload shape
```

---

## Environment variables

See `.env.example`.

| Variable                        | Default              | Purpose |
| ------------------------------- | -------------------- | ------- |
| `VITE_USE_CREATOR_MOCK`         | `true`               | Force mock mode. When not `true`, the SDK is used if `window.ZOHO` exists; otherwise the app falls back to mock mode automatically. |
| `VITE_CREATOR_APP_NAME`         | `external-deal-response` | Creator application link name used by SDK v2. |
| `VITE_CREATOR_FORM_LINK_NAME`   | `Deal_Response_Form` | Creator form link name passed to `addRecords`. |
| `VITE_CREATOR_REPORT_LINK_NAME` | `All_Deal_Responses` | Creator report link name required by `uploadFile`. |

Check the link names in Creator (Form settings > Link name) and adjust if they differ.

---

## Connecting to Zoho Creator

The Creator Widget SDK v2 is already loaded in `index.html` from:

```
https://static.zohocdn.com/creator/widgets/version/2.0/widgetsdk-min.js
```

It stays out of the bundle, so mock mode keeps working when the script is unavailable.

1. Set these in the deployed environment:
   - `VITE_USE_CREATOR_MOCK=false`
   - `VITE_CREATOR_APP_NAME` only if the app link name differs from `external-deal-response`
2. `creatorService.ts` picks the API automatically (SDK v2 has no `init()`):
   - **Logged-in Creator users** (no publish keys set): `ZOHO.CREATOR.DATA.addRecords(...)` then `ZOHO.CREATOR.FILE.uploadFile(...)`.
   - **External / anonymous users** (both publish keys set): `ZOHO.CREATOR.PUBLISH.addRecords(...)` then `ZOHO.CREATOR.PUBLISH.uploadFile(...)`, each with its `private_link`.
3. For external users, publish the form, the report, and the Page in Creator. Copy the key at the end of the published form URL into `VITE_CREATOR_FORM_PRIVATE_LINK` and the key from the published report URL into `VITE_CREATOR_REPORT_PRIVATE_LINK`. A `PUBLISH` call without its key is never answered by Creator, so every SDK call is wrapped in a timeout.
4. Embed the deployed URL in a Creator Page with the Deal ID appended, for example an iframe pointing to `https://your-app.vercel.app/?CRM_Deal_ID=${input.deal_id}`.

If Creator returns a different success shape, adjust `isSuccessfulResponse()` in the service file only. Success is currently detected by `code === 3000` and a `data.ID` on the add response.

### CRM file transfer (backend, not in this repo)

`Upload_File` must eventually land in a **custom File Upload field** on the CRM Deal, not the Attachments related list. That step is a Creator/Deluge workflow:

```
Creator stored file
  -> download the Creator file as a real file
  -> upload to Zoho CRM /crm/v8/files
  -> receive the encrypted ZFS file ID
  -> update the Deal's custom File Upload field via File_Id__s
```

The widget deliberately does not implement this and does not call `zoho.crm.attachFile()`.

---

## Testing the embed from localhost (HTTPS tunnel)

Zoho Creator is served over HTTPS, so an `http://localhost` iframe will be blocked as mixed content. Expose the dev server through a tunnel instead. The Vite server already binds to `0.0.0.0` and accepts any hostname.

```bash
npm run dev

# in a second terminal, either:
cloudflared tunnel --url http://localhost:5173
# or
ngrok http 5173
```

Then embed the generated HTTPS URL in Creator:

```
https://generated-tunnel-url.example/?CRM_Deal_ID=4728790000012345678
```

The app makes no assumptions about its host, so any tunnel or domain works.

---

## Deploying to Vercel

1. Push the repo and import it into Vercel.
2. Framework preset: **Vite**. Build command `npm run build`, output directory `dist`.
3. Add `VITE_USE_CREATOR_MOCK=false` (plus link-name overrides if needed) under Environment Variables.
4. `vercel.json` rewrites all routes to `index.html`.

---

## Security notes

- No OAuth client secrets, CRM access tokens, or record IDs are stored in the frontend.
- `CRM_Deal_ID` is read from the URL only, is never rendered, and is sent only as a field on the Creator record.
- The widget uploads only to the Creator record. CRM Attachments are never used.
- Backend validation of the Deal ID / token relationship should be added in Creator or a backend later.
