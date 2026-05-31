const TEAM_COLORS = {
    "Ferrari": "#e10600",
    "McLaren": "#ff8700",
    "Mercedes": "#00d2be",
    "Red Bull": "#1E41FF",
    "Williams": "#005aff",
    "Lotus F1": "#004225",
    "Lotus": "#004225",
    "Brabham": "#26436a",
    "Tyrrell": "#0054b4",
    "Cooper": "#228b22",
    "Benetton": "#0095b6",
    "Renault": "#fff500",
    "BRM": "#234e32",
    "Alfa Romeo": "#9B0000",
    "Maserati": "#002fa7",
    "Matra": "#007fff",
    "Brawn": "#bfff00",
    "Vanwall": "#1a472a",
    "Jordan": "#ffdd00",
    "BAR": "#b5a642",
    "Toyota": "#cc0000",
    "Force India": "#f596c8",
    "Haas F1 Team": "#b6babd",
    "Racing Point": "#f596c8",
    "AlphaTauri": "#2b4562",
    "Aston Martin": "#006f62",
    "Alpine": "#0090ff",
};
const DEFAULT_COLOR = "#62626a";
const getTeamColor = t => TEAM_COLORS[t] || DEFAULT_COLOR;


let driverHistory = []; // f1_drivers_history.json
let teamHistory = []; // f1_teams_history.json
let driverStats = []; // f1_driver_stats.json

let driverByYear = {}; // { year → [ rows ] }
let teamByYear = {}; // { year → { teamName → cumulative_wins } }
let teamByYearRaw = {}; // { year → { teamName → wins_year } } za streamgraph

let years = [];
let currentYearIdx  = 0;
let isPlaying = false;
let intervalTimer = null;
let speed = 700;

let sel1 = "Michael Schumacher";
let sel2 = "Lewis Hamilton";

//  SVG SETUP — BAR CHART RACE (DRIVERS)
const mBar = { top: 20, right: 55, bottom: 30, left: 150 };
const wBar = 550 - mBar.left - mBar.right;
const hBar = 400 - mBar.top  - mBar.bottom;

const svgDrv = d3.select("#barChartRace").append("svg")
    .attr("width", "100%")
    .attr("viewBox", `0 0 ${wBar + mBar.left + mBar.right} ${hBar + mBar.top + mBar.bottom}`)
    .append("g").attr("transform", `translate(${mBar.left},${mBar.top})`);

const xDrv = d3.scaleLinear().range([0, wBar]);
const yDrv = d3.scaleBand().range([0, hBar]).padding(0.18);
const xDrvAxis = svgDrv.append("g").attr("class","axis-dark").attr("transform",`translate(0,${hBar})`);
const bgDrvYear = svgDrv.append("text").attr("class","big-year-bg")
    .attr("x", wBar).attr("y", hBar - 10).attr("text-anchor","end");

//  SVG SETUP — BAR CHART RACE (TEAMS)
const svgTeam = d3.select("#teamChartRace").append("svg")
    .attr("width","100%")
    .attr("viewBox", `0 0 ${wBar + mBar.left + mBar.right} ${hBar + mBar.top + mBar.bottom}`)
    .append("g").attr("transform",`translate(${mBar.left},${mBar.top})`);

const xTeam = d3.scaleLinear().range([0, wBar]);
const yTeam = d3.scaleBand().range([0, hBar]).padding(0.18);
const xTeamAxis = svgTeam.append("g").attr("class","axis-dark").attr("transform",`translate(0,${hBar})`);
const bgTeamYear = svgTeam.append("text").attr("class","big-year-bg")
    .attr("x", wBar).attr("y", hBar - 10).attr("text-anchor","end");

//  SVG SETUP — LINE CHART
const mL  = { top: 30, right: 40, bottom: 40, left: 55 };
const wL  = 550 - mL.left - mL.right;
const hL  = 380 - mL.top  - mL.bottom;

const svgLine = d3.select("#driverDetailChart").append("svg")
    .attr("width","100%")
    .attr("viewBox", `0 0 ${wL + mL.left + mL.right} ${hL + mL.top + mL.bottom}`)
    .append("g").attr("transform",`translate(${mL.left},${mL.top})`);

const xLine = d3.scaleLinear().range([0, wL]);
const yLine = d3.scaleLinear().range([hL, 0]);
const gridG = svgLine.append("g").attr("class","grid-line");
const xLineAxis = svgLine.append("g").attr("class","axis-dark").attr("transform",`translate(0,${hL})`);
const yLineAxis = svgLine.append("g").attr("class","axis-dark");
const linePath1 = svgLine.append("path").attr("class","line-path");
const linePath2 = svgLine.append("path").attr("class","line-path-2");
const dotsG1 = svgLine.append("g");
const dotsG2 = svgLine.append("g");

//  SVG SETUP — RADAR CHART
const rRadius = 110;
const rW = 400, rH = 360;
const svgRadar = d3.select("#radarChart").append("svg")
    .attr("width", rW).attr("height", rH)
    .append("g").attr("transform", `translate(${rW/2},${rH/2 + 10})`);

//  LOAD DATA
Promise.all([
    d3.json("podaci/podaci/f1_drivers_history.json"),
    d3.json("podaci/podaci/f1_teams_history.json"),
    d3.json("podaci/podaci/f1_driver_stats.json")
]).then(([driversRaw, teamsRaw, statsRaw]) => {

    driverHistory = driversRaw;
    teamHistory = teamsRaw;
    driverStats = statsRaw;

    // index driver data by year
    driverHistory.forEach(d => {
        if (!driverByYear[d.year]) driverByYear[d.year] = [];
        driverByYear[d.year].push(d);
    });

    // build cumulative team wins by year (scan chronologically)
    const allTeamYears = [...new Set(teamHistory.map(d => d.year))].sort((a,b)=>a-b);
    const cumTeam = {};
    allTeamYears.forEach(yr => {
        const seasonRows = teamHistory.filter(d => d.year === yr);
        seasonRows.forEach(r => {
            cumTeam[r.team_name] = (cumTeam[r.team_name] || 0) + r.wins_year;
        });
        teamByYear[yr] = { ...cumTeam };

        // raw wins for streamgraph
        teamByYearRaw[yr] = {};
        seasonRows.forEach(r => { teamByYearRaw[yr][r.team_name] = r.wins_year; });
    });

    // skup svih godina iz oba skupa podataka
    const drvYears = Object.keys(driverByYear).map(Number);
    const teamYears = Object.keys(teamByYear).map(Number);
    years = [...new Set([...drvYears, ...teamYears])].sort((a,b)=>a-b);

    // slider
    d3.select("#yearSlider").attr("min", years[0]).attr("max", years[years.length-1]).property("value", years[0]);
    d3.select("#maxSliderYear").text(years[years.length-1]);

    // odabir vozača
    const uniqueDrivers = [...new Set(driverHistory.map(d => d.driver_name))].sort();
    const sel1El = d3.select("#driver1Select");
    const sel2El = d3.select("#driver2Select");
    uniqueDrivers.forEach(drv => {
        sel1El.append("option").attr("value",drv).text(drv);
        sel2El.append("option").attr("value",drv).text(drv);
    });

    // postavljanje defaultnih odabira (ako su prisutni u podacima)
    sel1 = uniqueDrivers.includes("Michael Schumacher") ? "Michael Schumacher" : uniqueDrivers[0];
    sel2 = uniqueDrivers.includes("Lewis Hamilton") ? "Lewis Hamilton" : uniqueDrivers[1];
    sel1El.property("value", sel1);
    sel2El.property("value", sel2);

    // initijalna renderizacija
    currentYearIdx = 0;
    updateDashboard(years[0]);
    updateLineChart();
    updateRadarChart();
    buildStreamgraph();

}).catch(err => {
    console.error("Greška pri učitavanju podataka:", err);
    document.body.insertAdjacentHTML("afterbegin",
        `<div style="color:#e10600;padding:20px;font-weight:bold;">
         ⚠ Greška pri učitavanju JSON datoteka. Provjeri jesu li generirane skriptom prepare_data.py i nalaze li se u mapi /podaci/.
         <br><small>${err}</small></div>`);
});

//  UPDATE DASHBOARD (izvor podataka: driverByYear i teamByYear)
function updateDashboard(year) {
    d3.select("#yearDisplay").text(year);
    d3.select("#yearSlider").property("value", year);
    bgDrvYear.text(year);
    bgTeamYear.text(year);

    // DRIVERS
    const yearDrivers = (driverByYear[year] || [])
        .slice()
        .sort((a,b) => b.cumulative_wins - a.cumulative_wins)
        .slice(0, 10);

    const maxDrvWins = d3.max(yearDrivers, d => d.cumulative_wins) || 5;
    xDrv.domain([0, maxDrvWins]);
    yDrv.domain(yearDrivers.map(d => d.driver_name));

    xDrvAxis.transition().duration(250).call(
        d3.axisBottom(xDrv).ticks(5).tickFormat(d3.format("d")));

    const dBars = svgDrv.selectAll(".drv-bar-g").data(yearDrivers, d => d.driver_name);
    dBars.exit().remove();
    const dEnter = dBars.enter().append("g").attr("class","drv-bar-g");
    dEnter.append("rect").attr("class","bar").attr("height", yDrv.bandwidth()).attr("fill","var(--red)").attr("rx",3);
    dEnter.append("text").attr("class","bar-label").attr("x",-10).attr("dy","0.35em").attr("text-anchor","end");
    dEnter.append("text").attr("class","bar-value").attr("dy","0.35em");

    // korištenje izvora
    // logika za animirano resortiranje stupaca preuzeta je i prilagođena prema:
    // [2] D3 Bar CHart Race (https://observablehq.com/@d3/bar-chart-race)
    // implementirana je .transition() metoda u kombinaciji s
    // d3.easeLinear() kako bi se postigao glatki efekt pomicanja pozicija i ažuriranje širine stupaca
    const dMerge = dBars.merge(dEnter);
    dMerge.transition().duration(250).ease(d3.easeLinear)
        .attr("transform", d => `translate(0,${yDrv(d.driver_name) ?? 0})`);
    dMerge.select("rect").attr("height", yDrv.bandwidth())
        .transition().duration(250).attr("width", d => xDrv(d.cumulative_wins));
    dMerge.select(".bar-label").text(d => d.driver_name).attr("y", yDrv.bandwidth()/2);
    dMerge.select(".bar-value")
        .attr("y", yDrv.bandwidth()/2)
        .attr("x", d => { const w = xDrv(d.cumulative_wins); return w > 40 ? w - 8 : w + 8; })
        .attr("text-anchor", d => xDrv(d.cumulative_wins) > 40 ? "end" : "start")
        .style("fill", d => xDrv(d.cumulative_wins) > 40 ? "#ffffff" : "var(--muted)")
        .text(d => d.cumulative_wins);

    // TEAMS
    const cumTeamData = teamByYear[year] || {};
    const yearTeams = Object.entries(cumTeamData)
        .map(([name, wins]) => ({ team_name: name, wins }))
        .filter(t => t.wins > 0)
        .sort((a,b) => b.wins - a.wins)
        .slice(0, 10);

    const maxTeamWins = d3.max(yearTeams, d => d.wins) || 5;
    xTeam.domain([0, maxTeamWins]);
    yTeam.domain(yearTeams.map(d => d.team_name));
    xTeamAxis.transition().duration(250).call(
        d3.axisBottom(xTeam).ticks(5).tickFormat(d3.format("d")));

    const tBars = svgTeam.selectAll(".team-bar-g").data(yearTeams, d => d.team_name);
    tBars.exit().remove();
    const tEnter = tBars.enter().append("g").attr("class","team-bar-g");
    tEnter.append("rect").attr("class","bar").attr("height", yTeam.bandwidth()).attr("rx",3);
    tEnter.append("text").attr("class","bar-label").attr("x",-10).attr("dy","0.35em").attr("text-anchor","end");
    tEnter.append("text").attr("class","bar-value").attr("dy","0.35em");

    const tMerge = tBars.merge(tEnter);
    tMerge.transition().duration(250).ease(d3.easeLinear)
        .attr("transform", d => `translate(0,${yTeam(d.team_name) ?? 0})`);
    tMerge.select("rect").attr("fill", d => getTeamColor(d.team_name)).attr("height", yTeam.bandwidth())
        .transition().duration(250).attr("width", d => xTeam(d.wins));
    tMerge.select(".bar-label").text(d => d.team_name).attr("y", yTeam.bandwidth()/2);
    tMerge.select(".bar-value")
        .attr("y", yTeam.bandwidth()/2)
        .attr("x", d => { const w = xTeam(d.wins); return w > 40 ? w - 8 : w + 8; })
        .attr("text-anchor", d => xTeam(d.wins) > 40 ? "end" : "start")
        .style("fill", d => {
        const w = xTeam(d.wins);
        const isInside = w > 40;

        // ako je tekst izvan stupca, na tamnoj pozadini mora biti bijel da se vidi
        if (!isInside) {
            return "#ffffff"; 
        }

        // ako je tekst unutar stupca i pozadina svijetla (Renault), tekst mora biti crn
        if (d.team_name === "Renault") {
            return "#000000";
        }
        
        // za sve ostale timove, ako je tekst unutar stupca, stavi bijelu
        return "#ffffff";
    })
        .text(d => d.wins);
}

//  LINE CHART
function updateLineChart() {
    const d1 = driverHistory.filter(d => d.driver_name === sel1).sort((a,b) => a.year - b.year);
    const d2 = driverHistory.filter(d => d.driver_name === sel2).sort((a,b) => a.year - b.year);

    d3.select("#labelDriver1").text(`Vozač 1 — ${sel1}`);
    d3.select("#labelDriver2").text(`Vozač 2 — ${sel2}`);

    const allYrs  = [...d1.map(d=>d.year),  ...d2.map(d=>d.year)];
    const allWins = [...d1.map(d=>d.cumulative_wins), ...d2.map(d=>d.cumulative_wins)];
    if (!allYrs.length) return;

    xLine.domain([d3.min(allYrs) - 0.5, d3.max(allYrs) + 0.5]);
    yLine.domain([0, (d3.max(allWins) || 10) + 5]);

    gridG.selectAll("*").remove();
    gridG.call(d3.axisLeft(yLine).tickSize(-wL).tickFormat(""));

    xLineAxis.transition().duration(400).call(d3.axisBottom(xLine).ticks(8).tickFormat(d3.format("d")));
    yLineAxis.transition().duration(400).call(d3.axisLeft(yLine).ticks(6));

    const lineGen = d3.line().x(d => xLine(d.year)).y(d => yLine(d.cumulative_wins)).curve(d3.curveMonotoneX);

    const lineTooltip = d3.select("#lineTooltip");

const drawLine = (path, dotsGroup, data, cls) => {
    if (data.length) {
        path.datum(data).transition().duration(400).attr("d", lineGen);
        const dots = dotsGroup.selectAll("circle").data(data);
        dots.exit().remove();
        dots.enter().append("circle").attr("class","dot")
            .attr("r", 3.5)
            .merge(dots)
            .attr("cx", d => xLine(d.year))
            .attr("cy", d => yLine(d.cumulative_wins))
            .attr("fill", cls === 1 ? "var(--d1)" : "var(--d2)")
            .attr("stroke", "var(--card-bg)")
            .on("mouseover", function(event, d) {
                d3.select(this).transition().duration(100).attr("r", 6);
                lineTooltip.style("opacity", 1);
            })
            .on("mousemove", function(event, d) {
                const driverName = cls === 1 ? sel1 : sel2;
                const color = cls === 1 ? "var(--d1)" : "var(--d2)";
                lineTooltip.html(`
                    <div style="text-align:center;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;
                         font-weight:700;color:var(--muted);font-size:10px;letter-spacing:2px;">SEZONA ${d.year}</div>
                    <div style="font-size:14px;font-weight:800;color:${color};">${driverName}</div>
                    <div style="color:var(--muted);margin-top:6px;font-size:12px;line-height:1.7;">
                        Pobjede u sezoni: <strong style="color:#fff">${d.wins_year ?? 0}</strong><br>
                        Ukupne pobjede: <strong style="color:${color}">${d.cumulative_wins}</strong>
                    </div>
                `)
                .style("left", (event.clientX + 18) + "px")
                .style("top",  (event.clientY - 40) + "px");
            })
            .on("mouseleave", function() {
                d3.select(this).transition().duration(100).attr("r", 3.5);
                lineTooltip.style("opacity", 0);
            });
    } else {
        path.attr("d","");
        dotsGroup.selectAll("circle").remove();
    }
};

    drawLine(linePath1, dotsG1, d1, 1);
    drawLine(linePath2, dotsG2, d2, 2);
}

//  RADAR CHART  (čita iz f1_driver_stats.json)
const RADAR_METRICS = ["wins", "podiums", "pole_positions", "championships", "consistency"];
const RADAR_LABELS = ["Pobjede", "Postolja", "Pole pozicije", "Naslovi", "Konstantnost"];

function updateRadarChart() {
    svgRadar.selectAll("*").remove();

    const getStats = name => driverStats.find(d => d.driver_name === name)
        || { wins:0, podiums:0, pole_positions:0, championships:0, consistency:50 };

    const s1 = getStats(sel1);
    const s2 = getStats(sel2);

    // odredi maksimalne vrijednosti za svaku metriku radi skaliranja poligona
    const maxVal = {};
    RADAR_METRICS.forEach(m => {
        maxVal[m] = d3.max(driverStats, d => d[m]) || 1;
    });

    const N = RADAR_METRICS.length;
    const angleSlice = (2 * Math.PI) / N;

    // koncentrični poligoni za referencu (25%, 50%, 75%, 100%)
    [0.25, 0.5, 0.75, 1.0].forEach(frac => {
        const pts = RADAR_METRICS.map((_, i) => {
            const a = angleSlice * i - Math.PI / 2;
            return [rRadius * frac * Math.cos(a), rRadius * frac * Math.sin(a)];
        });
        svgRadar.append("polygon")
            .attr("points", pts.map(p => p.join(",")).join(" "))
            .attr("fill","none")
            .attr("stroke","var(--card-border)")
            .attr("stroke-dasharray","3,3");
    });

    // korištenje izvora
    // koncept Radar Charta preuzet je i inspiriran primjerom:
    //[4] Radar Chart (https://observablehq.com/@palewire/radar-chart)
    // način korištenja: izvor je kroišten za razumijevanje logike i postavljanja
    // polarnih osi i mapiranja više varijabli na radijalne dimenzije
    // implementacija crtanja poligona prilagođena je vlastitoj arhitekturi koda
    RADAR_METRICS.forEach((m, i) => {
        const a = angleSlice * i - Math.PI / 2;
        const x = rRadius * Math.cos(a);
        const y = rRadius * Math.sin(a);
        svgRadar.append("line").attr("x1",0).attr("y1",0).attr("x2",x).attr("y2",y)
            .attr("stroke","var(--axis)").attr("stroke-width",1);
        svgRadar.append("text")
            .attr("x", (rRadius + 20) * Math.cos(a))
            .attr("y", (rRadius + 14) * Math.sin(a))
            .attr("text-anchor","middle")
            .attr("dominant-baseline","middle")
            .style("font-size","11px")
            .style("font-family","var(--font-body)")
            .style("fill","var(--muted)")
            .text(RADAR_LABELS[i]);
    });

    // nacrtaj poligon za jednog vozača
    const drawArea = (stats, color, dash) => {
        const pts = RADAR_METRICS.map((m, i) => {
            const a = angleSlice * i - Math.PI / 2;
            const r = rRadius * Math.min(stats[m] / maxVal[m], 1);
            return [r * Math.cos(a), r * Math.sin(a)];
        });
        svgRadar.append("polygon")
            .attr("points", pts.map(p => p.join(",")).join(" "))
            .attr("fill", color)
            .attr("fill-opacity", 0.18)
            .attr("stroke", color)
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", dash || "none");
    };

    drawArea(s1, "var(--d1)");
    drawArea(s2, "var(--d2)", "6,3");

    // legenda
    d3.select("#radarLegend").html(`
        <span><span class="legend-dot" style="background:var(--d1)"></span>${sel1}</span>
        <span><span class="legend-dot" style="background:var(--d2);opacity:.7"></span>${sel2}</span>
    `);
}

//  STREAMGRAPH  (čita wins_year iz f1_teams_history.json)
function buildStreamgraph() {
    const mS = { top:20, right:30, bottom:45, left:50 };
    const wS = 1200 - mS.left - mS.right;
    const hS = 340  - mS.top  - mS.bottom;

    // skup svih timova
    const allTeams = [...new Set(teamHistory.map(d => d.team_name))];

    // transformiraj podatke u format pogodan za streamgraph: niz objekata { year, team1: wins, team2: wins, ... }
    const streamData = years.map(yr => {
        const raw = teamByYearRaw[yr] || {};
        const row = { year: yr };
        allTeams.forEach(t => { row[t] = raw[t] || 0; });
        return row;
    });

    // korištenje izvora
    // za vizualizaciju dominacije konstruktora korišten je streamgraph uzorak:
    // [3] D3 Streamgraph (https://observablehq.com/@d3/streamgraph)
    // način korištenja: korištena je funkcija d3.stack() s d3.stackOffsetSilhouette 
    // za centriranje podataka i d3.area() s curveBasis krivuljom za "tekući" prikaz
    const stack = d3.stack().keys(allTeams).offset(d3.stackOffsetSilhouette);
    const series = stack(streamData);

    const xS = d3.scaleLinear().domain(d3.extent(years)).range([0, wS]);
    const yS = d3.scaleLinear()
        .domain([
            d3.min(series, s => d3.min(s, d => d[0])),
            d3.max(series, s => d3.max(s, d => d[1]))
        ]).range([hS, 0]);

    const area = d3.area()
        .x(d => xS(d.data.year))
        .y0(d => yS(d[0]))
        .y1(d => yS(d[1]))
        .curve(d3.curveBasis);

    const svgS = d3.select("#teamStreamgraph").append("svg")
        .attr("width","100%")
        .attr("viewBox", `0 0 ${wS + mS.left + mS.right} ${hS + mS.top + mS.bottom}`)
        .append("g").attr("transform", `translate(${mS.left},${mS.top})`);

    svgS.selectAll(".stream-layer")
        .data(series)
        .enter().append("path")
        .attr("class","stream-layer")
        .attr("d", area)
        .attr("fill", d => getTeamColor(d.key))
        .attr("opacity", 0.82);

    const mouseLine = svgS.append("line").attr("class","mouse-line")
        .attr("y1",0).attr("y2",hS);

    const tooltip = d3.select("#streamTooltip");
    const mainTitle = d3.select("#streamgraphTitle");

    svgS.append("rect")
        .attr("width", wS).attr("height", hS)
        .attr("fill","none").attr("pointer-events","all")
        .on("mouseover", () => { mouseLine.style("opacity",1); tooltip.style("opacity",1); })
        .on("mouseleave", () => {
            mouseLine.style("opacity",0); tooltip.style("opacity",0);
            svgS.selectAll(".stream-layer").attr("opacity", 0.82);
            mainTitle.html("Pobjede po sezoni — Tokovi dominacije timova");
        })
        .on("mousemove", function(event) {
            const [mx, my] = d3.pointer(event);
            let yr = Math.round(xS.invert(mx));
            yr = Math.max(years[0], Math.min(years[years.length-1], yr));
            mouseLine.attr("x1", xS(yr)).attr("x2", xS(yr));

            const yi = streamData.findIndex(d => d.year === yr);
            let activeTeam = null;
            if (yi !== -1) {
                for (const s of series) {
                    const pt = s[yi];
                    if (pt) {
                        const y0 = yS(pt[0]), y1 = yS(pt[1]);
                        if (my >= Math.min(y0,y1) && my <= Math.max(y0,y1)) {
                            activeTeam = s.key; break;
                        }
                    }
                }
            }

            svgS.selectAll(".stream-layer")
                .attr("opacity", d => activeTeam ? (d.key === activeTeam ? 1.0 : 0.1) : 0.82);

            if (activeTeam) {
                mainTitle.html(`Pobjede po sezoni | <span style="color:${getTeamColor(activeTeam)}">${activeTeam}</span>`);
            }

            const pobjedeGod = activeTeam && teamByYearRaw[yr] ? (teamByYearRaw[yr][activeTeam] || 0) : 0;
            const pobjedeKum = activeTeam && teamByYear[yr] ? (teamByYear[yr][activeTeam] || 0) : 0;

            tooltip.html(`
                <div style="text-align:center;border-bottom:1px solid #333;padding-bottom:5px;margin-bottom:8px;
                     font-weight:700;color:var(--muted);font-size:10px;letter-spacing:2px;">SEZONA ${yr}</div>
                ${activeTeam ? `
                <div style="font-size:15px;font-weight:800;color:#fff;display:flex;align-items:center;gap:8px;">
                    <span style="color:${getTeamColor(activeTeam)};font-size:18px;">■</span>${activeTeam}
                </div>
                <div style="color:var(--muted);margin-top:6px;font-size:12px;line-height:1.7;">
                    Pobjede u sezoni: <strong style="color:#fff">${pobjedeGod}</strong><br>
                    Ukupne pobjede: <strong style="color:#fff">${pobjedeKum}</strong>
                </div>` : `<div style="color:var(--muted);font-style:italic;font-size:12px;">Prijeđite preko vala…</div>`}
            `)
            .style("left", (event.clientX + 22) + "px")
            .style("top", (event.clientY - 35) + "px");
        });

    svgS.append("g").attr("class","axis-dark")
        .attr("transform",`translate(0,${hS})`)
        .call(d3.axisBottom(xS).ticks(15).tickFormat(d3.format("d")));
}

//  PLAYBACK CONTROLS
const playBtn = d3.select("#playButton");

function stopRace() {
    clearInterval(intervalTimer);
    playBtn.text("▶ Pokreni");
    isPlaying = false;
}

playBtn.on("click", () => {
    if (isPlaying) { stopRace(); return; }
    playBtn.text("⏹ Zaustavi");
    isPlaying = true;
    intervalTimer = setInterval(() => {
        currentYearIdx = (currentYearIdx + 1) % years.length;
        updateDashboard(years[currentYearIdx]);
    }, speed);
});

d3.select("#speedSelect").on("change", function() {
    speed = +this.value;
    if (isPlaying) { stopRace(); playBtn.node().click(); }
});

d3.select("#yearSlider").on("input", function() {
    stopRace();
    const yr = +this.value;
    const idx = years.indexOf(yr);
    if (idx !== -1) { currentYearIdx = idx; updateDashboard(yr); }
});

d3.select("#driver1Select").on("change", function() { sel1 = this.value; updateLineChart(); updateRadarChart(); });
d3.select("#driver2Select").on("change", function() { sel2 = this.value; updateLineChart(); updateRadarChart(); });