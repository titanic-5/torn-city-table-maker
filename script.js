let apiInput;
window.onload = function () {
  apiInput = document.getElementById("apikey");
  apiInput.value = localStorage.getItem("apikey") || "";
};
const storeInput = () => localStorage.setItem("apikey", apiInput.value);
const numberWithCommas = (x) => (x ? x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "N/A");

const replaceZerosWithNA = () => {
  document.querySelectorAll("td").forEach((cell) => {
    if (["0", "NaN"].includes(cell.textContent)) cell.textContent = "N/A";
  });
};

const createTableCell = (value) => {
  const td = document.createElement("td");
  td.textContent = numberWithCommas(value);
  return td;
};

const generateFile = (csv) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const filename = `export-${new Date().toLocaleDateString()}.csv`;
  const link = Object.assign(document.createElement("a"), {
    id: "csv-download-link",
    href: url,
    download: filename,
  });
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};


function parseData() {
  const [input, result] = document.querySelectorAll("#data-input, #result");
  const data = input.value.split(/(?=\b\w+\s\[\d+\])/).slice(1);

  const vars = {
    strength: /Strength:\s*([\d,]+|N\/A)/,
    speed: /Speed:\s*([\d,]+|N\/A)/,
    dexterity: /Dexterity:\s*([\d,]+|N\/A)/,
    defense: /Defense:\s*([\d,]+|N\/A)/,
    total: /Total:\s*([\d,]+|N\/A)/,
  };

  const rows = data.map((entry) => {
    const [, name, id] = entry.match(/^(.*)\[(\d+)\]/);

    const values = {};
    for (const [key, regex] of Object.entries(vars)) {
      const match = entry.match(regex);
      values[key] = match ? (match[1] === "N/A" ? null : match[1].replace(/,/g, "")) : null;
    }

    const numericValues = {};
    for (const key of Object.keys(values)) {
      numericValues[key] = values[key] !== null ? parseInt(values[key], 10) : null;
    }

    const keys = ["strength", "speed", "dexterity", "defense", "total"];
    const missing = keys.filter((k) => numericValues[k] === null);

    // If exactly one stat is missing, figure it out
    if (missing.length === 1) {
      const missingKey = missing[0];
      if (missingKey === "total") {
        numericValues.total =
          (numericValues.strength || 0) + (numericValues.speed || 0) + (numericValues.dexterity || 0) + (numericValues.defense || 0);
      } else {
        numericValues[missingKey] =
          (numericValues.total || 0) - keys.filter((k) => k !== "total" && k !== missingKey).reduce((sum, k) => sum + (numericValues[k] || 0), 0);
      }
    }

    const finalValues = keys.map((k) => (numericValues[k] !== null ? numericValues[k].toString() : "0"));
    return [`${name}[${id}]`, ...finalValues];
  });

  result.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Name[ID]</th><th>Strength</th><th>Speed</th><th>Dexterity</th><th>Defense</th><th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) =>
              `<tr><td>${r[0]}</td>${r
                .slice(1)
                .map((v) => `<td>${numberWithCommas(v)}</td>`)
                .join("")}</tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
  sortTable();
}

function sortTable() {
  const table = document.querySelector("table");
  const tbody = table.tBodies[0];

  const parseCell = (cell) => {
    const v = cell.textContent.replace(/,/g, "").trim();
    return ["0", "NaN", "N/A"].includes(v) ? null : parseInt(v);
  };

  const data = Array.from(tbody.rows)
    .map((row) => {
      const cells = row.cells;
      const [nameId, ...stats] = Array.from(cells).map((c) => c.textContent);
      const [, id] = nameId.match(/\[(\d+)\]/);
      const name = nameId.split("[")[0].trim();

      return {
        name,
        id,
        strength: parseCell(cells[1]),
        speed: parseCell(cells[2]),
        dexterity: parseCell(cells[3]),
        defense: parseCell(cells[4]),
        total: parseCell(cells[5]),
      };
    })
    .sort((a, b) => b.total - a.total);

  tbody.innerHTML = "";
  data.forEach((row) => {
    const tr = document.createElement("tr");
    const link = Object.assign(document.createElement("a"), {
      href: `https://www.torn.com/profiles.php?XID=${row.id}`,
      target: "_blank",
      textContent: `${row.name}[${row.id}]`,
    });
    const td = document.createElement("td");
    td.appendChild(link);
    tr.appendChild(td);
    ["strength", "speed", "dexterity", "defense", "total"].forEach((key) => {
      tr.appendChild(createTableCell(row[key]));
    });
    tbody.appendChild(tr);
  });
  replaceZerosWithNA();
}

const exportTableToCSV = () => {
  const sanitize = (c) => c.textContent.replaceAll(",", "");
  const rows = Array.from(document.querySelectorAll("table tr"));
  const csv = rows.map((r) => Array.from(r.cells).map(sanitize).join(",")).join("\r\n");
  generateFile(csv);
};

async function exportTableToYATA() {
  const apiKey = apiInput.value;
  const rows = Array.from(document.querySelector("table").tBodies[0].rows);
  const progress = document.getElementById("progress");
  const progressText = document.getElementById("progress-text");

  let count = 0;
  const results = await Promise.all(
    rows.map(async (row, i) => {
      const [nameId, strength, speed, dexterity, defense, total] = Array.from(row.cells, (c) => c.textContent.replace(/,/g, ""));
      const [, id] = nameId.match(/\[(\d+)\]/);
      const name = nameId.split("[")[0].trim();
      const now = new Date();
      const formattedDate = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(
        now.getFullYear()
      ).slice(-2)}`;

      const [res] = await Promise.allSettled([
        fetch(`https://api.torn.com/user/${id}?selections=profile&key=${apiKey}`),
        new Promise((r) => setTimeout(r, 250)),
      ]);

      if (res.status === "fulfilled") {
        const data = await res.value.json();
        count++;
        progress.value = (count / rows.length) * 100;
        progressText.textContent = `${count} / ${rows.length}`;

        const stats = [strength, defense, speed, dexterity, total].map((stat) => (stat === "N/A" ? "0" : stat));

        // copied format of tornstats export
        return [
          null, // row number (#)
          `"${name} [${id}]"`,
          data.level || "",
          data.faction.faction_name || null,
          ...stats,
          null, // FF Bonus
          formattedDate,
        ];
      }
      return null;
    })
  );

  const filtered = results.filter(Boolean);
  const csvHeader = '#,Name,Level,Faction,Strength,Defense,Speed,Dexterity,Total,"FF Bonus","Last Update"\r\n';
  const csvBody = filtered.map((r) => [r[0], ...r.slice(1)].join(",")).join("\r\n");
  const csv = csvHeader + csvBody;
  generateFile(csv);
}

function showProgress() {
  const text = document.getElementById("progress-text");
  const bar = document.getElementById("progress");
  const wrapper = document.getElementById("progress-bar");

  if (text && bar) {
    text.textContent = "";
    bar.value = 0;
  } else {
    const span = document.createElement("span");
    span.textContent = "Progress: ";
    const textSpan = Object.assign(document.createElement("span"), { id: "progress-text" });
    span.appendChild(textSpan);
    const progress = Object.assign(document.createElement("progress"), { id: "progress", value: 0, max: 100 });
    wrapper.append(span, progress);
  }
}
