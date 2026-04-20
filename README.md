# Observable D3 notebook for BS EN 1990 to BS EN 1999

This workspace contains an Observable notebook module plus an HTML preview for real public metadata about the `BS EN 1990` to `BS EN 1999` Eurocode series and a D3 force-directed graph.

Files:

- `bs-en-1990-1999.json`: referenced data file with real series metadata
- `bsi-standards-notebook.js`: Observable notebook module
- `preview.html`: browser preview page

What the notebook includes:

- Real series titles, committees, current documents, and part lists for `BS EN 1990` through `BS EN 1999`
- Material/type metadata plus publication and applicability dates for timeline filtering
- A graph transformation from JSON standards metadata to `{nodes, links}`
- A directed D3 visualization showing public series links, public scope links, and explicitly labeled architecture inferences

Important limitation:

- Public BSI catalogue pages do not expose the complete internal normative and informative reference clauses for each standard.
- The JSON therefore uses public catalogue evidence where available and labels architecture-level inferences explicitly.
- In the current dataset, applicability start dates are aligned to public publication dates unless a separate public applicability date is known.

To preview it locally, serve the folder over local HTTP and then open `preview.html`.

Example:

- `python -m http.server 8000`
- Open `http://localhost:8000/preview.html`

The Observable notebook code remains in `bsi-standards-notebook.js` if you want to adapt or paste it into Observable separately.
