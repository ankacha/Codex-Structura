export default function define(runtime, observer) {
  const main = runtime.module();

  main.variable(observer()).define(["md"], function(md) {
    return md`# BS EN 1990 to BS EN 1999 Reference Graph

Real public metadata for the \`BS EN 1990\` to \`BS EN 1999\` Eurocode series, plus a graph showing catalogue-backed and architecture-level relationships between the codes.`;
  });

  main.variable(observer("d3")).define("d3", async function() {
    return import("https://cdn.jsdelivr.net/npm/d3@7/+esm");
  });

  main.variable(observer("dataset")).define("dataset", async function() {
    const response = await fetch(new URL("./bs-en-1990-1999.json", import.meta.url));
    return response.json();
  });

  main.variable(observer("standards")).define("standards", ["dataset"], function(dataset) {
    return dataset.standards;
  });

  main.variable(observer()).define(["md"], function(md) {
    return md`## Data model

Each standard is loaded from a referenced JSON file and represented as a node with metadata. Relationships become directed links with a \`kind\` field:

- \`public-series-link\`: directly supported by a public source
- \`public-scope-link\`: derived from public part titles or series scope
- \`architecture-inference\`: clearly labeled Eurocode-structure inference where full internal references are not public`;
  });

  main.variable(observer("graph")).define("graph", ["standards"], function(standards) {
    const nodeByCode = new Map(
      standards.map((standard) => [
        standard.code,
        {
          id: standard.code,
          title: standard.title,
          committee: standard.committee,
          eurocode: standard.eurocode,
          material: standard.material,
          standardType: standard.standardType,
          currentDocumentCode: standard.currentDocument.code,
          published: standard.currentDocument.published,
          applicabilityFrom: standard.applicability?.from || standard.currentDocument.published,
          applicabilityTo: standard.applicability?.to || null
        }
      ])
    );

    const links = [];

    for (const standard of standards) {
      for (const reference of standard.references) {
        if (nodeByCode.has(reference.target)) {
          links.push({
            source: standard.code,
            target: reference.target,
            type: reference.kind,
            relationship: reference.label,
            basis: reference.basis,
            sourceUrl: reference.sourceUrl
          });
        }
      }
    }

    const degreeById = new Map();
    for (const node of nodeByCode.values()) degreeById.set(node.id, 0);
    for (const link of links) {
      degreeById.set(link.source, (degreeById.get(link.source) || 0) + 1);
      degreeById.set(link.target, (degreeById.get(link.target) || 0) + 1);
    }

    const nodes = Array.from(nodeByCode.values(), (node) => ({
      ...node,
      degree: degreeById.get(node.id) || 0
    }));

    return { nodes, links };
  });

  main.variable(observer()).define(["md", "graph"], function(md, graph) {
    return md`## Network architecture

- Nodes: ${graph.nodes.length} standards
- Links: ${graph.links.length} directed relationships
- Edge colors: orange for public series links, blue for public scope links, slate for architecture inference
- Node size: total number of incoming and outgoing relationships`;
  });

  main.variable(observer("chart")).define("chart", ["d3", "graph", "dataset"], function(d3, graph, dataset) {
    const color = d3
      .scaleOrdinal()
      .domain(["public-series-link", "public-scope-link", "architecture-inference"])
      .range(["#c2410c", "#2563eb", "#475569"]);

    const root = document.createElement("div");
    root.style.display = "grid";
    root.style.gap = "18px";
    root.style.fontFamily = "sans-serif";

    const controls = document.createElement("div");
    controls.style.display = "grid";
    controls.style.gap = "12px";

    const timelinePanel = document.createElement("div");
    timelinePanel.style.border = "1px solid #dbe3ee";
    timelinePanel.style.borderRadius = "18px";
    timelinePanel.style.background = "linear-gradient(180deg, #ffffff, #f8fbff)";
    timelinePanel.style.padding = "18px";
    const timelineTitle = document.createElement("div");
    timelineTitle.innerHTML = "<h3 style='margin:0 0 8px;'>Timeline</h3><p style='margin:0 0 12px; color:#475569;'>Bars show applicability windows and dots show published dates for the currently filtered standards.</p>";
    const timelineHost = document.createElement("div");
    timelinePanel.appendChild(timelineTitle);
    timelinePanel.appendChild(timelineHost);

    const graphLayout = document.createElement("div");
    graphLayout.style.display = "grid";
    graphLayout.style.gridTemplateColumns = "minmax(0, 1fr) 320px";
    graphLayout.style.gap = "18px";
    graphLayout.style.alignItems = "start";

    const graphHost = document.createElement("div");
    graphHost.style.border = "1px solid #dbe3ee";
    graphHost.style.borderRadius = "18px";
    graphHost.style.background = "linear-gradient(180deg, #ffffff, #f8fbff)";
    graphHost.style.minHeight = "760px";
    graphHost.style.overflow = "hidden";

    const sidebar = document.createElement("aside");
    sidebar.style.border = "1px solid #dbe3ee";
    sidebar.style.borderRadius = "18px";
    sidebar.style.background = "#f8fafc";
    sidebar.style.padding = "18px";
    sidebar.style.minHeight = "760px";

    const materialSelect = createSelect("All materials", Array.from(new Set(dataset.standards.map((d) => d.material))).sort());
    const typeSelect = createSelect("All types", Array.from(new Set(dataset.standards.map((d) => d.standardType))).sort());
    const fromInput = createDateInput();
    const toInput = createDateInput();

    controls.appendChild(createControl("Material", materialSelect));
    controls.appendChild(createControl("Type of standard", typeSelect));
    controls.appendChild(createControl("Published/applicable from", fromInput));
    controls.appendChild(createControl("Published/applicable to", toInput));

    const timelineLayout = document.createElement("div");
    timelineLayout.style.display = "grid";
    timelineLayout.style.gridTemplateColumns = "minmax(0, 1fr) 300px";
    timelineLayout.style.gap = "18px";
    timelineLayout.style.alignItems = "start";

    timelineLayout.appendChild(timelinePanel);
    timelineLayout.appendChild(controls);

    root.appendChild(timelineLayout);
    graphLayout.appendChild(graphHost);
    graphLayout.appendChild(sidebar);
    root.appendChild(graphLayout);

    let selectedId = null;

    for (const input of [materialSelect, typeSelect, fromInput, toInput]) {
      input.addEventListener("input", renderAll);
      input.addEventListener("change", renderAll);
    }

    renderAll();
    return root;

    function renderAll() {
      const filteredStandards = filterStandards();
      const filteredGraph = deriveFilteredGraph(filteredStandards);
      const selectedStandard = filteredStandards.find((d) => d.code === selectedId) || null;

      renderTimeline(filteredStandards);
      renderGraph(filteredGraph);
      renderSidebar(selectedStandard, filteredGraph);
    }

    function filterStandards() {
      const filters = {
        material: materialSelect.value,
        standardType: typeSelect.value,
        from: fromInput.value || null,
        to: toInput.value || null
      };

      return dataset.standards.filter((standard) => {
        const published = standard.currentDocument.published;
        const applicableFrom = standard.applicability?.from || published;
        const comparable = applicableFrom || published;

        if (filters.material !== "all" && standard.material !== filters.material) return false;
        if (filters.standardType !== "all" && standard.standardType !== filters.standardType) return false;
        if (filters.from && comparable < filters.from) return false;
        if (filters.to && published > filters.to) return false;
        return true;
      });
    }

    function deriveFilteredGraph(filteredStandards) {
      const allowed = new Set(filteredStandards.map((d) => d.code));
      return {
        nodes: graph.nodes.filter((node) => allowed.has(node.id)),
        links: graph.links.filter((link) => {
          const source = link.source.id || link.source;
          const target = link.target.id || link.target;
          return allowed.has(source) && allowed.has(target);
        })
      };
    }

    function renderTimeline(filteredStandards) {
      timelineHost.innerHTML = "";
      if (!filteredStandards.length) {
        timelineHost.innerHTML = "<div style='padding:20px; border:1px dashed #cbd5e1; border-radius:14px; color:#475569; background:#ffffff;'>No standards match the current filters.</div>";
        return;
      }

      const width = 1120;
      const rowHeight = 34;
      const margin = { top: 16, right: 20, bottom: 34, left: 180 };
      const height = margin.top + margin.bottom + filteredStandards.length * rowHeight;

      const dates = filteredStandards.flatMap((standard) => {
        const published = new Date(standard.currentDocument.published);
        const applicableFrom = new Date(standard.applicability?.from || standard.currentDocument.published);
        const applicableTo = standard.applicability?.to ? new Date(standard.applicability.to) : new Date();
        return [published, applicableFrom, applicableTo];
      });

      const x = d3.scaleTime().domain(d3.extent(dates)).nice().range([margin.left, width - margin.right]);
      const y = d3.scaleBand().domain(filteredStandards.map((d) => d.code)).range([margin.top, height - margin.bottom]).padding(0.28);

      const svg = d3.create("svg").attr("viewBox", [0, 0, width, height]).style("max-width", "100%");

      svg
        .append("g")
        .selectAll("rect")
        .data(filteredStandards)
        .join("rect")
        .attr("x", 0)
        .attr("y", (d) => y(d.code))
        .attr("width", width)
        .attr("height", y.bandwidth())
        .attr("fill", (d) => (d.code === selectedId ? "rgba(37, 99, 235, 0.08)" : "transparent"))
        .style("cursor", "pointer")
        .on("click", (event, d) => {
          selectedId = d.code;
          renderAll();
        });

      svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(Math.min(8, filteredStandards.length + 2)).tickSizeOuter(0));
      svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).tickSize(0)).call((g) => g.select(".domain").remove());

      svg
        .append("g")
        .selectAll("line")
        .data(filteredStandards)
        .join("line")
        .attr("x1", (d) => x(new Date(d.applicability?.from || d.currentDocument.published)))
        .attr("x2", (d) => x(d.applicability?.to ? new Date(d.applicability.to) : new Date()))
        .attr("y1", (d) => y(d.code) + y.bandwidth() / 2)
        .attr("y2", (d) => y(d.code) + y.bandwidth() / 2)
        .attr("stroke", (d) => (d.code === selectedId ? "#1d4ed8" : "#94a3b8"))
        .attr("stroke-width", (d) => (d.code === selectedId ? 10 : 8))
        .attr("stroke-linecap", "round")
        .style("cursor", "pointer")
        .on("click", (event, d) => {
          selectedId = d.code;
          renderAll();
        });

      svg
        .append("g")
        .selectAll("circle")
        .data(filteredStandards)
        .join("circle")
        .attr("cx", (d) => x(new Date(d.currentDocument.published)))
        .attr("cy", (d) => y(d.code) + y.bandwidth() / 2)
        .attr("r", (d) => (d.code === selectedId ? 7 : 5))
        .attr("fill", (d) => (d.code === selectedId ? "#c2410c" : "#1d4ed8"))
        .style("cursor", "pointer")
        .on("click", (event, d) => {
          selectedId = d.code;
          renderAll();
        });

      timelineHost.appendChild(svg.node());
    }

    function renderGraph(filteredGraph) {
      graphHost.innerHTML = "";
      if (!filteredGraph.nodes.length) {
        graphHost.innerHTML = "<div style='padding:20px; color:#475569;'>No graph nodes are available for the current filter selection.</div>";
        return;
      }

      const width = 1180;
      const height = 760;
      const nodes = filteredGraph.nodes.map((d) => ({ ...d, boxWidth: 220, boxHeight: 64 }));
      const links = filteredGraph.links.map((d) => ({ ...d }));

      const svg = d3
        .create("svg")
        .attr("viewBox", [-width / 2, -height / 2, width, height])
        .attr("width", width)
        .attr("height", height)
        .style("max-width", "100%")
        .style("height", "auto");

      svg
        .append("defs")
        .selectAll("marker")
        .data(["public-series-link", "public-scope-link", "architecture-inference"])
        .join("marker")
        .attr("id", (d) => `arrow-${d}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 18)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("fill", (d) => color(d))
        .attr("d", "M0,-5L10,0L0,5");

      const simulation = d3
        .forceSimulation(nodes)
        .force("link", d3.forceLink(links).id((d) => d.id).distance((d) => (d.type === "public-series-link" ? 210 : d.type === "public-scope-link" ? 250 : 290)).strength(0.55))
        .force("charge", d3.forceManyBody().strength(-1400))
        .force("center", d3.forceCenter(0, 0))
        .force("x", d3.forceX((d, i) => -width / 2 + 140 + (i * (width - 280)) / Math.max(nodes.length - 1, 1)).strength(0.18))
        .force("y", d3.forceY(0).strength(0.06))
        .force("collide", d3.forceCollide().radius((d) => Math.max(d.boxWidth / 2, d.boxHeight / 2) + 26));

      const link = svg
        .append("g")
        .attr("stroke-opacity", 0.85)
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke", (d) => color(d.type))
        .attr("stroke-width", (d) => (d.type === "public-series-link" ? 2.8 : 1.8))
        .attr("stroke-dasharray", (d) => (d.type === "architecture-inference" ? "5,4" : null))
        .attr("marker-end", (d) => `url(#arrow-${d.type})`);

      const node = svg
        .append("g")
        .selectAll("g")
        .data(nodes)
        .join("g")
        .style("cursor", "pointer")
        .call(
          d3
            .drag()
            .on("drag", (event, d) => {
              d.x = event.x;
              d.y = event.y;
              d.fx = event.x;
              d.fy = event.y;
              renderPositions();
            })
            .on("end", (event, d) => {
              d.fx = event.x;
              d.fy = event.y;
            })
        )
        .on("click", (event, d) => {
          selectedId = d.id;
          renderAll();
        });

      node
        .append("rect")
        .attr("x", (d) => -d.boxWidth / 2)
        .attr("y", (d) => -d.boxHeight / 2)
        .attr("rx", 14)
        .attr("width", (d) => d.boxWidth)
        .attr("height", (d) => d.boxHeight)
        .attr("fill", (d) => (d.id === selectedId ? "#eff6ff" : "#ffffff"))
        .attr("stroke", (d) => (d.id === selectedId ? "#1d4ed8" : "#111827"))
        .attr("stroke-width", (d) => (d.id === selectedId ? 3 : 1.8));

      node
        .append("text")
        .attr("text-anchor", "middle")
        .attr("fill", "#0f172a")
        .each(function(d) {
          const text = d3.select(this);
          text.append("tspan").attr("x", 0).attr("y", -8).attr("font-size", 12).attr("font-weight", 700).text(d.id);
          text.append("tspan").attr("x", 0).attr("y", 12).attr("font-size", 11).attr("fill", "#475569").text(shortenTitle(d.title, 34));
        });

      simulation.stop();
      for (let i = 0; i < 300; i += 1) simulation.tick();
      for (const node of nodes) {
        node.fx = node.x;
        node.fy = node.y;
      }

      renderPositions();
      graphHost.appendChild(svg.node());

      function renderPositions() {
        link
          .attr("x1", (d) => d.source.x)
          .attr("y1", (d) => d.source.y)
          .attr("x2", (d) => d.target.x)
          .attr("y2", (d) => d.target.y);

        node.attr("transform", (d) => `translate(${d.x},${d.y})`);
      }
    }

    function renderSidebar(standard, filteredGraph) {
      if (!standard) {
        sidebar.innerHTML = "<h3 style='margin:0 0 10px;'>Select a standard</h3><p style='margin:0; color:#475569;'>Click a node to view the standard title, committee, publication and applicability dates, current document, parts, and outgoing relationships.</p>";
        return;
      }

      const outgoing = filteredGraph.links.filter((link) => (link.source.id ? link.source.id === standard.code : link.source === standard.code));

      sidebar.innerHTML = `
        <h3 style="margin:0 0 10px;">${standard.code}</h3>
        <p style="margin:0 0 14px;">${standard.title}</p>
        <div style="display:grid; gap:8px; margin:14px 0 18px;">
          <div style="padding:10px 12px; border:1px solid #dbe3ee; border-radius:12px; background:#ffffff;"><strong>Material</strong><br>${standard.material}</div>
          <div style="padding:10px 12px; border:1px solid #dbe3ee; border-radius:12px; background:#ffffff;"><strong>Type</strong><br>${standard.standardType}</div>
          <div style="padding:10px 12px; border:1px solid #dbe3ee; border-radius:12px; background:#ffffff;"><strong>Committee</strong><br>${standard.committee}</div>
          <div style="padding:10px 12px; border:1px solid #dbe3ee; border-radius:12px; background:#ffffff;"><strong>Published</strong><br>${formatDate(standard.currentDocument.published)}</div>
          <div style="padding:10px 12px; border:1px solid #dbe3ee; border-radius:12px; background:#ffffff;"><strong>Applicable from</strong><br>${formatDate(standard.applicability?.from || standard.currentDocument.published)}</div>
          <div style="padding:10px 12px; border:1px solid #dbe3ee; border-radius:12px; background:#ffffff;"><strong>Current document</strong><br><a href="${standard.currentDocument.url}" target="_blank" rel="noreferrer">${standard.currentDocument.code}</a></div>
        </div>
        <h3 style="margin:16px 0 8px;">Parts</h3>
        <ul style="margin:0; padding-left:18px;">
          ${standard.parts.map((part) => `<li>${part}</li>`).join("")}
        </ul>
        <h3 style="margin:16px 0 8px;">Outgoing relationships</h3>
        <ul style="margin:0; padding-left:18px;">
          ${outgoing.length ? outgoing.map((link) => `<li><strong>${link.relationship}</strong> to ${typeof link.target === "string" ? link.target : link.target.id}<br><span style="color:#475569;">${link.basis}</span></li>`).join("") : "<li>No outgoing relationships recorded.</li>"}
        </ul>
      `;
    }

    function createControl(label, input) {
      const wrap = document.createElement("div");
      wrap.style.border = "1px solid #dbe3ee";
      wrap.style.borderRadius = "14px";
      wrap.style.background = "#f8fafc";
      wrap.style.padding = "12px";
      const title = document.createElement("label");
      title.textContent = label;
      title.style.display = "block";
      title.style.fontSize = "0.84rem";
      title.style.fontWeight = "600";
      title.style.color = "#475569";
      title.style.marginBottom = "8px";
      wrap.appendChild(title);
      wrap.appendChild(input);
      return wrap;
    }

    function createSelect(allLabel, values) {
      const select = document.createElement("select");
      select.style.width = "100%";
      select.style.border = "1px solid #cbd5e1";
      select.style.borderRadius = "10px";
      select.style.padding = "9px 10px";
      select.innerHTML = [`<option value="all">${allLabel}</option>`].concat(values.map((value) => `<option value="${value}">${value}</option>`)).join("");
      return select;
    }

    function createDateInput() {
      const input = document.createElement("input");
      input.type = "date";
      input.style.width = "100%";
      input.style.border = "1px solid #cbd5e1";
      input.style.borderRadius = "10px";
      input.style.padding = "9px 10px";
      return input;
    }

    function formatDate(value) {
      if (!value) return "Open-ended";
      return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "2-digit" }).format(new Date(value));
    }

    function shortenTitle(title, maxLength) {
      return title.length > maxLength ? `${title.slice(0, maxLength - 1)}...` : title;
    }
  });

  main.variable(observer()).define(["md", "dataset"], function(md, dataset) {
    return md`## Notes

- Real catalogue data lives in the referenced JSON file
- Each relationship carries its own evidence note and source URL
- Timeline filtering uses \`material\`, \`standardType\`, publication date, and applicability dates from the JSON schema
- ${dataset.meta.referenceLimitations}`;
  });

  return main;
}
