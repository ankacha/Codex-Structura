let masterData = [];
let filteredData = [];

// THE TOOLTIP: A floating div that follows the mouse
const tooltip = d3.select("body").append("div")
    .style("position", "absolute")
    .style("background", "rgba(15, 23, 42, 0.9)") // Dark gray background
    .style("color", "white")
    .style("padding", "8px 12px")
    .style("border-radius", "6px")
    .style("font-size", "12px")
    .style("pointer-events", "none") // Prevents the tooltip from blocking mouse clicks
    .style("opacity", 0); // Start completely invisible

//fetch the data
fetch("master_standards.json")

//check server for response
    .then(function(response) {
        if(!response.ok){
            //throw an error if it can't be loaded
            throw new Error("Could not find the file! Status: " + response.status)
        }
        return response.json();
    })
//load the data if it works
    .then(function(data){
        console.log("Success! Loading dock recieved " + data.length + "Standards.");
        //store in global vars
        masterData = data;
        filteredData = data;

        populateDropdowns();
        applyFilters();
        //start drawing here later
    })
//catch the error if it fails
    .catch(function(error){
        console.error("Oops! Something went wrong, loading dock did not recieve the data", error);
    })

//populate dropdown function
// 3. THE SETUP: Populating the Dropdowns
function populateDropdowns() {
    const materialDropdown = d3.select("#material-filter");
    const typeDropdown = d3.select("#type-filter");
    
    // Wipe them clean first, just in case the factory runs twice
    materialDropdown.html("");
    typeDropdown.html("");
    
    // --- Add options to the Material dropdown ---
    // The .text() is what the user sees. The .attr("value") is the exact word the factory searches for.
    materialDropdown.append("option").text("All Materials / Disciplines").attr("value", "all");
    materialDropdown.append("option").text("Concrete (91.080.40)").attr("value", "Concrete");
    materialDropdown.append("option").text("Steel (91.080.10)").attr("value", "Steel");
    materialDropdown.append("option").text("Timber (91.080.20)").attr("value", "Timber");
    materialDropdown.append("option").text("Masonry (91.080.30)").attr("value", "Masonry");
    materialDropdown.append("option").text("Geotechnics (93.020)").attr("value", "Geotechnics");
    materialDropdown.append("option").text("Fire Protection (13.220.50)").attr("value", "Fire");
    materialDropdown.append("option").text("Wind & Loading (91.010.30)").attr("value", "Loading");

    // --- Add options to the Type/Status dropdown ---
    typeDropdown.append("option").text("All Statuses").attr("value", "all");
    typeDropdown.append("option").text("Current Only").attr("value", "Current");
    typeDropdown.append("option").text("Withdrawn").attr("value", "Withdrawn");
    typeDropdown.append("option").text("Superseded").attr("value", "Superseded");
    typeDropdown.append("option").text("Draft / Proposed").attr("value", "Draft");
    typeDropdown.append("option").text("Obsolescent").attr("value", "Obsolescent");

    // Tell D3 to listen for changes on ANY dropdown or input in the filter box
    d3.selectAll(".filter select, .filter input").on("change", function() {
        applyFilters(); 
    });
}

//filtering logic
// 4. THE SORTING ROOM: Filtering Logic
function applyFilters() {
    // Read what the user currently has selected in the dropdowns and date boxes
    const selectedMaterial = d3.select("#material-filter").property("value");
    const selectedType = d3.select("#type-filter").property("value");
    const dateFrom = d3.select("#date-from").property("value"); // Comes out as "YYYY-MM-DD"
    const dateTo = d3.select("#date-to").property("value");

    // Start with the full 12,000 list
    filteredData = masterData;

    // Filter by Material
// Filter by Material / Discipline (Global String Search)
    if (selectedMaterial !== "all") {
        // Convert the search term to lowercase so we don't miss anything due to capitalization
        const searchTerm = selectedMaterial.toLowerCase();
        
        filteredData = filteredData.filter(function(standard) {
            // Loop through every single column/key in this standard's JSON object
            for (let key in standard) {
                const value = standard[key];
                
                // If the value is text AND it contains our search term, keep the standard!
                if (typeof value === "string" && value.toLowerCase().includes(searchTerm)) {
                    return true; 
                }
            }
            // If we checked every single field and found nothing, discard it
            return false; 
        });
    }

    // Filter by Status
    if (selectedType !== "all") {
        filteredData = filteredData.filter(function(standard) {
            if (!standard.Status) return false;
            return standard.Status.includes(selectedType);
        });
    }

    // NEW: Filter by Date
    // If the user picked a date, grab the first 4 characters (the year). Otherwise, use extreme defaults.
    const fromYear = dateFrom ? parseInt(dateFrom.substring(0, 4)) : 1800;
    const toYear = dateTo ? parseInt(dateTo.substring(0, 4)) : 2100;

    filteredData = filteredData.filter(function(standard) {
        const pubYear = parseInt(standard["Publication_Year"]) || 9999;
        return pubYear >= fromYear && pubYear <= toYear;
    });

    // Sort chronologically (Oldest First)
    filteredData.sort(function(a, b) {
        const yearA = parseInt(a["Publication_Year"]) || 9999;
        const yearB = parseInt(b["Publication_Year"]) || 9999;
        return yearA - yearB; 
    });

    updateDashboard();
}
//update table and timeline etc.
function updateDashboard(){
    d3.select("#stats").html(`
        <div class="stat"><strong>${filteredData.length}</strong> Standards Match Filters</div>
    `);

    drawTable();
    drawTimeline();
}
//reset and add new rows to the bottom table
function drawTable(){
    const tbody = d3.select("#table-body");
    tbody.selectAll("tr").remove();

    const rows = tbody.selectAll("tr")
        .data(filteredData.slice(0,100))
        .enter()
        .append("tr");

    rows.append("td").text(function(d) { return d.Designation; });
    rows.append("td").text(function(d) { return d.Title; });
    rows.append("td").text(function(d) { return d.Status; });
    rows.append("td").text(function(d) { return d["Publication_Year"] || d["Publication date"]; });
    rows.append("td").text(function(d) { return d["Withdrawn on"] || "-"; });

}

// 7. ASSEMBLY LINE A: The Scrollable Gantt Timeline
function drawTimeline() {
    // Step A: Wipe BOTH chalkboards clean
    d3.select("#timeline-header").selectAll("*").remove();
    d3.select("#timeline-body").selectAll("*").remove();

    // Step B: Set up our spacing
    const margin = { top: 0, right: 150, bottom: 0, left: 30 };
    const rowHeight = 45; 
    const dynamicHeight = (filteredData.length * rowHeight) + 50;

    // We check the width of the new header box
    const boxWidth = document.getElementById("timeline-header").clientWidth;
    const width = boxWidth - margin.left - margin.right;
    
    // Step C: Find the Oldest and Newest Years (Unchanged)
    const yearRange = [
        d3.min(filteredData, d => parseInt(d["Publication_Year"]) || 1900),
        d3.max(filteredData, d => {
            if (d["Withdrawn on"]) {
                const match = String(d["Withdrawn on"]).match(/\d{4}/);
                if (match) return parseInt(match[0]);
            }
            return new Date().getFullYear(); 
        })
    ];

    // The Tape Measure (Unchanged)
    const xScale = d3.scaleLinear()
        .domain([yearRange[0] - 2, yearRange[1] + 2]) 
        .range([0, width]);

    // --- NEW: THE HEADER (Fixed Ruler) ---
    // We create a tiny SVG just 30 pixels tall for the ruler
    const headerSvg = d3.select("#timeline-header")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", 30) 
        .append("g")
        // Push the ruler down to the bottom edge of this 30px box
        .attr("transform", `translate(${margin.left}, 28)`); 

    // Draw the Ruler
    headerSvg.call(d3.axisTop(xScale).tickFormat(d3.format("d"))); 
    // --- NEW: THE HIGHLIGHTER BRUSH ---
    
    // 1. Create the brush tool
    // d3.brushX means it only draws horizontally (left and right).
    // The 'extent' maps exactly to the size of our ruler box.
    const brush = d3.brushX()
        .extent([[0, -28], [width, 2]]) 
        .on("start brush end", brushed); // Tell it to run the 'brushed' function whenever the user drags the mouse

    // 2. Attach the brush paper to the header
    headerSvg.append("g")
        .attr("class", "brush")
        .call(brush);

    // 3. The Highlight Logic
    function brushed(event) {
        const selection = event.selection;

        // If the user clicks outside the box to clear it, restore everything to 100% opacity
        if (!selection) {
            bodySvg.selectAll(".standard-row")
                .style("opacity", 1)
                .style("pointer-events", "all"); // Make sure they are all clickable again
            return;
        }

        // Run the Tape Measure in reverse! Convert the left/right pixel edges back into Years.
        const year0 = xScale.invert(selection[0]);
        const year1 = xScale.invert(selection[1]);

        // Loop through all the rows on the factory floor
        bodySvg.selectAll(".standard-row").style("opacity", function(d) {
            const pubYear = parseInt(d["Publication_Year"]) || 1900;
            
            let endYear = new Date().getFullYear();
            if (d["Withdrawn on"]) {
                const match = String(d["Withdrawn on"]).match(/\d{4}/);
                if (match) endYear = parseInt(match[0]);
            }

            // Check if the standard was alive during the highlighted time box
            // (It started before the box ended, AND it ended after the box started)
            const isOverlapping = pubYear <= year1 && endYear >= year0;

            // If it overlaps, keep it solid (1). If it doesn't, ghost it out (0.1).
            return isOverlapping ? 1 : 0.1; 
        })
        // Optional: We turn off mouse clicks for the ghosted items so the tooltip doesn't get annoying
        .style("pointer-events", function(d) {
            const pubYear = parseInt(d["Publication_Year"]) || 1900;
            let endYear = new Date().getFullYear();
            if (d["Withdrawn on"]) {
                const match = String(d["Withdrawn on"]).match(/\d{4}/);
                if (match) endYear = parseInt(match[0]);
            }
            return (pubYear <= year1 && endYear >= year0) ? "all" : "none";
        });
    }

    // --- NEW: THE BODY (Scrollable Rows) ---
    // We create the massive SVG inside the scrollable box
    const bodySvg = d3.select("#timeline-body")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        // Make sure it is at least as tall as the scroll box, so it doesn't look weird if there are only 2 standards
        .attr("height", Math.max(dynamicHeight, 400)) 
        .append("g")
        .attr("transform", `translate(${margin.left}, 0)`);

    // Step F: Draw the Rows (Using bodySvg instead of svg)
    const rows = bodySvg.selectAll(".standard-row")
        .data(filteredData)
        .enter()
        .append("g")
        .attr("class", "standard-row")
        // Push each row down. The first row starts at 20px down.
        .attr("transform", function(d, i) { return `translate(0, ${i * rowHeight + 20})`; });

    // 1. Draw the Text Group (Designation + Title)
    const textGroup = rows.append("text")
        .attr("x", function(d) { return xScale(parseInt(d["Publication_Year"]) || 1900) + 15; })
        .attr("y", -6) // Shift the text block slightly up so it balances with the dot
        .attr("text-anchor", "start");

    // Line 1: The Designation (Bold)
    textGroup.append("tspan")
        .text(function(d) { return d.Designation; })
        .style("font-size", "13px")
        .style("font-weight", "600")
        .style("fill", "var(--text)");

    // Line 2: The Title (Smaller and Gray)
    textGroup.append("tspan")
        // We truncate the title to 60 characters so it doesn't fly off the screen
        .text(function(d) { 
            if (!d.Title) return "";
            return d.Title.length > 60 ? d.Title.substring(0, 60) + "..." : d.Title; 
        })
        // We MUST repeat the X coordinate, otherwise SVG puts it at the very left edge
        .attr("x", function(d) { return xScale(parseInt(d["Publication_Year"]) || 1900) + 15; }) 
        // 'dy' means "Drop down on the Y axis". 1.2em is exactly 1.2 lines down.
        .attr("dy", "1.2em") 
        .style("font-size", "11px")
        .style("fill", "var(--muted)");

    // 2. Draw the Lifespan Bar
    rows.append("rect")
        .attr("x", function(d) { return xScale(parseInt(d["Publication_Year"]) || 1900); })
        .attr("y", -6) 
        .attr("height", 12) 
        .attr("width", function(d) {
            const startYear = parseInt(d["Publication_Year"]) || 1900;
            let endYear = new Date().getFullYear(); 
            
            if (d["Withdrawn on"]) {
                const match = String(d["Withdrawn on"]).match(/\d{4}/);
                if (match) endYear = parseInt(match[0]);
            }
            return Math.max(xScale(endYear) - xScale(startYear), 5);
        })
        .attr("fill", "var(--series)")
        .attr("opacity", 0.2); 

    // 3. Draw the Publication Dot
rows.append("circle")
        .attr("class", "timeline-node")
        .attr("cx", function(d) { return xScale(parseInt(d["Publication_Year"]) || 1900); })
        .attr("cy", 0)
        .attr("r", 6)
        .attr("fill", "var(--series)")
        .style("cursor", "pointer")
        
        // NEW: Mouse interactions!
        .on("mouseover", function(event, d) {
            // Make the dot slightly bigger
            d3.select(this).attr("r", 9); 
            
            // NEW: Figure out what to write for the withdrawal date
            const withdrawnText = d["Withdrawn on"] ? d["Withdrawn on"] : "Current / Active";

            // Make the tooltip visible and inject the multi-line text
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip.html(`
                <strong>${d.Designation}</strong><br>
                Published: ${d["Publication date"] || "N/A"}<br>
                Withdrawn: ${withdrawnText}
            `);
        })
        .on("mousemove", function(event) {
            // Move the tooltip to wherever the mouse currently is (plus a 15px offset so it doesn't cover the mouse)
            tooltip
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 15) + "px");
        })
.on("mouseout", function(event, d) {
            d3.select(this).attr("r", 6); 
            tooltip.transition().duration(200).style("opacity", 0);
        })
        // NEW: The Click Trigger
        .on("click", function(event, d) {
            // When clicked, run our two new assembly lines:
            updateSidebar(d);
            drawNetworkGraph(d);
        });


// 8. THE SIDEBAR: Printing the Details
function updateSidebar(standard) {
    const sidebar = d3.select("#sidebar");
    
    // Check if it's withdrawn or active to style it nicely
    const statusColor = standard.Status && standard.Status.includes("Withdrawn") ? "#991b1b" : "#166534";
    const statusBg = standard.Status && standard.Status.includes("Withdrawn") ? "#fef2f2" : "#f0fdf4";

    // Write the HTML directly into the sidebar panel
    sidebar.html(`
        <h3 style="margin-bottom: 5px;">${standard.Designation}</h3>
        <p style="font-weight: bold; color: var(--text);">${standard.Title || "No Title Available"}</p>
        
        <div style="display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; color: ${statusColor}; background-color: ${statusBg}; margin-bottom: 15px;">
            ${standard.Status || "Unknown Status"}
        </div>

        <div class="meta">
            <div>
                <strong style="font-size: 11px; color: var(--muted); text-transform: uppercase;">Published Date</strong><br>
                ${standard["Publication date"] || "N/A"}
            </div>
            <div>
                <strong style="font-size: 11px; color: var(--muted); text-transform: uppercase;">Withdrawn Date</strong><br>
                ${standard["Withdrawn on"] || "Current / Active"}
            </div>
            <div>
                <strong style="font-size: 11px; color: var(--muted); text-transform: uppercase;">Committee</strong><br>
                ${standard["National Committee"] || "N/A"}
            </div>
        </div>

        <h4 style="margin-top: 20px; margin-bottom: 5px;">Abstract</h4>
        <p class="muted" style="font-size: 13px;">${standard.Abstract ? standard.Abstract : "No abstract provided in the database."}</p>
    `);
}

// 9. THE PHYSICS ENGINE: Drawing the Network Graph
function drawNetworkGraph(clickedStandard) {
    // 1. Wipe the graph canvas clean
    const graphBox = document.getElementById("graph");
    d3.select("#graph").selectAll("*").remove();
    
    const width = graphBox.clientWidth;
    const height = graphBox.clientHeight || 500;

// 2. The Data Hunt (Recursive Lineage Tracing)
    let nodesMap = new Map(); 
    let links = [];
    
    // Safety check to prevent infinite loops if standards reference each other cyclically
    let processedLinks = new Set(); 

    // Put the clicked standard in the exact center
    nodesMap.set(clickedStandard.BSI_ID, { 
        id: clickedStandard.BSI_ID, 
        label: clickedStandard.Designation, 
        title: clickedStandard.Title,
        isCenter: true 
    });

    // The Recursive Function: It will run itself layer by layer
    function traceLineage(standard, currentDepth, maxDepth) {
        // Stop digging if we hit the user's depth limit
        if (currentDepth >= maxDepth) return;

        // 1. Trace FORWARD (Replaced by)
        if (standard["Replaced by"]) {
            const forwardIds = standard["Replaced by"].split("|");
            
            forwardIds.forEach(relId => {
                const cleanId = relId.trim();
                const linkKey = standard.BSI_ID + "->" + cleanId;

                // Only process this relationship if we haven't seen it yet
                if (!processedLinks.has(linkKey)) {
                    processedLinks.add(linkKey);
                    const found = masterData.find(s => s.BSI_ID === cleanId);
                    
                    if (found) {
                        if (!nodesMap.has(found.BSI_ID)) {
                            nodesMap.set(found.BSI_ID, { 
                                id: found.BSI_ID, label: found.Designation, title: found.Title, isCenter: false 
                            });
                        }
                        // Arrow points OUT to the newer standard
                        // Add branch: "future"
                        links.push({ source: standard.BSI_ID, target: found.BSI_ID, label: "Replaced by", branch: "future" });
                        
                        // RECURSION: Tell the function to run again on this newly found standard!
                        traceLineage(found, currentDepth + 1, maxDepth); 
                    }
                }
            });
        }

// 2. Trace BACKWARD (Replaces)
        if (standard["Replaces"]) {
            const backwardIds = standard["Replaces"].split("|");
            
            backwardIds.forEach(relId => {
                const cleanId = relId.trim();
                const linkKey = cleanId + "->" + standard.BSI_ID; 

                if (!processedLinks.has(linkKey)) {
                    processedLinks.add(linkKey);
                    const found = masterData.find(s => s.BSI_ID === cleanId);
                    
                    if (found) {
                        if (!nodesMap.has(found.BSI_ID)) {
                            nodesMap.set(found.BSI_ID, { 
                                id: found.BSI_ID, label: found.Designation, title: found.Title, isCenter: false 
                            });
                        }
                        
                        // FIX: The arrow correctly points from Older (found) to Newer (standard).
                        // We change the label so it grammatically reads: "[Older] is Replaced by [Newer]".
                        // Add branch: "past"
                        links.push({ source: found.BSI_ID, target: standard.BSI_ID, label: "Replaced by", branch: "past" });
                        
                        // RECURSION: Dig deeper into the past
                        traceLineage(found, currentDepth + 1, maxDepth); 
                    }
                }
            });
        }
    }

    // Run the trace! Start at Depth 0, and dig up to 3 levels deep.
    traceLineage(clickedStandard, 0, 3);

    const nodes = Array.from(nodesMap.values());

    // 3. Create the Canvas
// 3. Create the Canvas and the Zoom Tool
    const svg = d3.select("#graph").append("svg")
        .attr("width", width)
        .attr("height", height);

    // --- NEW: Define the Zoom Behavior ---
    const zoom = d3.zoom()
        .scaleExtent([0.1, 4]) // Set limits: zoom out to 10%, zoom in to 400%
        .on("zoom", function(event) {
            // Every time the mouse wheels or drags, update the master folder's position
            zoomContainer.attr("transform", event.transform);
        });

    // Attach the zoom listener to the entire SVG canvas
    svg.call(zoom);
    
    // --- NEW: The Master Folder ---
    // Everything we draw from now on goes into THIS folder, not the SVG directly!
    const zoomContainer = svg.append("g");
// --- NEW: Define the Colored Arrowheads ---
    const defs = svg.append("defs");

    // 1. The Ancestor Arrow (Orange/Red)
    defs.append("marker")
        .attr("id", "arrow-past")
        .attr("viewBox", "-0 -5 10 10").attr("refX", 65).attr("refY", 0).attr("orient", "auto")
        .attr("markerWidth", 8).attr("markerHeight", 8).attr("xoverflow", "visible")
        .append("svg:path").attr("d", "M 0,-5 L 10 ,0 L 0,5")
        .attr("fill", "#ea580c").style("stroke","none"); // Orange

    // 2. The Descendant Arrow (Blue)
    defs.append("marker")
        .attr("id", "arrow-future")
        .attr("viewBox", "-0 -5 10 10").attr("refX", 65).attr("refY", 0).attr("orient", "auto")
        .attr("markerWidth", 8).attr("markerHeight", 8).attr("xoverflow", "visible")
        .append("svg:path").attr("d", "M 0,-5 L 10 ,0 L 0,5")
        .attr("fill", "#2563eb").style("stroke","none"); // Blue

// 4. Start the Physics Engine
    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(200)) 
        .force("charge", d3.forceManyBody().strength(-1000)) 
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(185).iterations(3));

// 5. Draw the physical lines (with dynamic colors)
    const link = zoomContainer.append("g")
        .selectAll("line")
        .data(links)
        .enter().append("line")
        // Check the branch tag: Blue for future, Orange for past
        .attr("stroke", d => d.branch === "future" ? "#2563eb" : "#ea580c")
        .attr("stroke-width", 2)
        // Attach the matching colored arrowhead
        .attr("marker-end", d => d.branch === "future" ? "url(#arrow-future)" : "url(#arrow-past)");

// Draw the floating text labels (with dynamic colors)
    const linkLabel = zoomContainer.append("g")
        .selectAll("text")
        .data(links)
        .enter().append("text")
        .text(function(d) { return d.label; })
        .style("font-size", "10px")
        .style("font-weight", "bold")
        // Match the text color to the line color
        .style("fill", d => d.branch === "future" ? "#2563eb" : "#ea580c")
        .style("text-anchor", "middle")
        .style("paint-order", "stroke")
        .style("stroke", "#ffffff")
        .style("stroke-width", "4px");

// 6. Draw the Vertical Interactive Cards (Nodes)
    const node = zoomContainer.append("g")
        .selectAll("g")
        .data(nodes)
        .enter().append("g")
        .style("cursor", "pointer")
        .on("mouseover", function() { d3.select(this).select("rect").attr("stroke-width", 3); })
        .on("mouseout", function() { d3.select(this).select("rect").attr("stroke-width", 1.5); })
        .on("click", function(event, d) {
            const fullStandard = masterData.find(s => s.BSI_ID === d.id);
            if (fullStandard) {
                updateSidebar(fullStandard);
                drawNetworkGraph(fullStandard);
            }
        });

    // Define fixed card dimensions
    const cardWidth = 200;
    const cardHeight = 100;

    // Draw the Vertical Rectangle Background
    node.append("rect")
        // Shift left and up by half the width/height to perfectly center the physics lines
        .attr("x", -cardWidth / 2)
        .attr("y", -cardHeight / 2)
        .attr("width", cardWidth)
        .attr("height", cardHeight)
        .attr("rx", 8) // Rounded corners
        .attr("fill", function(d) { return d.isCenter ? "#fff7ed" : "#f8fafc"; })
        .attr("stroke", function(d) { return d.isCenter ? "var(--series)" : "var(--border)"; })
        .attr("stroke-width", 1.5);

    // Embed HTML inside the SVG to handle automatic text wrapping
    node.append("foreignObject")
        .attr("x", -cardWidth / 2)
        .attr("y", -cardHeight / 2)
        .attr("width", cardWidth)
        .attr("height", cardHeight)
        .style("pointer-events", "none") // Let the mouse click the rect underneath
        .append("xhtml:div")
        // Use CSS Flexbox to perfectly center the HTML text inside the card
        .style("width", "100%")
        .style("height", "100%")
        .style("padding", "10px")
        .style("box-sizing", "border-box")
        .style("display", "flex")
        .style("flex-direction", "column")
        .style("justify-content", "center")
        .style("align-items", "center")
        .style("text-align", "center")
        .style("overflow", "hidden")
        .html(function(d) {
            // Allow up to 80 characters of the title before truncating
            const titleStr = d.title ? (d.title.length > 80 ? d.title.substring(0, 80) + "..." : d.title) : "";
            
            return `
                <div style="font-size: 12px; font-weight: bold; color: var(--text); margin-bottom: 6px; line-height: 1.2;">
                    ${d.label}
                </div>
                <div style="font-size: 10px; color: var(--muted); line-height: 1.3;">
                    ${titleStr}
                </div>
            `;
        });


// 7. The Tick Function (The actual bouncing animation)
    simulation.on("tick", function() {
        // Move the lines
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        // Move the labels to the exact mathematical midpoint of the line
        linkLabel
            .attr("x", function(d) { return (d.source.x + d.target.x) / 2; })
            // Shift the text 8 pixels up so it hovers above the line instead of sitting directly on it
            .attr("y", function(d) { return ((d.source.y + d.target.y) / 2) - 8; });

        // Move the cards
        node.attr("transform", d => `translate(${d.x},${d.y})`);
    });
}
}