"use strict";

// ============================================================
// 1. IMPORTS
// ============================================================
import { d2Get, d2PostJson, d2PutJson } from "./js/d2api.js";
import { templateOutlier, templateConsistency, templateCompleteness, templateCompletenessDisaggregated } from "./js/templates.js";
import "./css/style.css";

// ============================================================
// 2. STATE
// ============================================================
let baseConfig;
let currentImport = {};

// Searchable select: bind a filter <input> to a native <select> so
// typing removes non-matching options. Uses DOM add/remove instead of
// option.hidden (which Safari doesn't support on <option>). The select
// is rendered with size="8" to show a scrollable listbox.
const selectFilterState = {}; // selectId → { allOptions: HTMLOptionElement[], filterEl }

function bindSelectFilter(filterId, selectId) {
    const filterEl = document.getElementById(filterId);
    const selectEl = document.getElementById(selectId);
    if (!filterEl || !selectEl) return;
    // Avoid double-binding
    if (filterEl.dataset.bound) return;
    filterEl.dataset.bound = "1";

    // Snapshot current options (will be refreshed by resetSelectFilter)
    selectFilterState[selectId] = {
        allOptions: Array.from(selectEl.options).map(function (o) { return o.cloneNode(true); }),
        filterEl: filterEl
    };

    filterEl.addEventListener("input", function () {
        const term = filterEl.value.toLowerCase();
        const state = selectFilterState[selectId];
        if (!state) return;
        const prevValue = selectEl.value;
        // Rebuild the select with only matching options
        selectEl.innerHTML = "";
        state.allOptions.forEach(function (opt) {
            if (opt.value === "" || opt.textContent.toLowerCase().indexOf(term) !== -1) {
                selectEl.appendChild(opt.cloneNode(true));
            }
        });
        // Restore previous selection if it still exists
        selectEl.value = prevValue;
    });

    selectEl.setAttribute("size", "8");
}

// Snapshot current options and clear the filter. Call after repopulating
// the select's innerHTML (e.g. after an async fetch).
function resetSelectFilter(filterId, selectId) {
    const filterEl = document.getElementById(filterId);
    const selectEl = document.getElementById(selectId);
    if (filterEl) filterEl.value = "";
    if (selectEl) {
        // Re-snapshot options from the freshly populated select
        selectFilterState[selectId] = {
            allOptions: Array.from(selectEl.options).map(function (o) { return o.cloneNode(true); }),
            filterEl: filterEl
        };
        selectEl.setAttribute("size", "8");
    }
}

// ============================================================
// 3. UTILITY HELPERS
// ============================================================

function el(id) {
    return document.getElementById(id);
}

async function generateUids(count) {
    if (!count) count = 1;
    const data = await d2Get("/api/system/id?limit=" + count);
    return data["codes"];
}

// Cached lookups — avoid repeated API calls and warnings during a single preview
let cachedDefaultCoCId = null;
let cachedIndicatorTypePercentId = null;

async function defaultCoCId() {
    if (cachedDefaultCoCId) return cachedDefaultCoCId;
    const data = await d2Get("/api/categoryOptionCombos?filter=name:eq:default&fields=id");
    const cocs = data["categoryOptionCombos"];
    if (cocs.length > 1) {
        // Use the first one (oldest by ID order from the API), warn once per session
        showNotification("Duplicate default categoryOptionCombos found. Using " + cocs[0]["id"], "warning");
    }
    cachedDefaultCoCId = cocs[0]["id"];
    return cachedDefaultCoCId;
}

async function indicatorTypePercentId() {
    if (cachedIndicatorTypePercentId) return cachedIndicatorTypePercentId;
    const data = await d2Get("/api/indicatorTypes.json?fields=id&filter=factor:eq:100&filter=number:eq:false");
    const inTypes = data["indicatorTypes"];
    if (inTypes.length > 1) {
        // Use the first one (oldest by ID order from the API), warn once per session
        showNotification("Duplicate percentage indicator types found. Using the first match.", "warning");
    }
    cachedIndicatorTypePercentId = inTypes[0]["id"];
    return cachedIndicatorTypePercentId;
}

function hasObject(list, prop, val) {
    for (const item of list) {
        if (item[prop] == val) return true;
    }
    return false;
}

function shareMetadata(metadata, groupId) {
    for (const type in metadata) {
        for (const elem of metadata[type]) {
            elem["sharing"] = {
                "public": "r-------",
                "userGroups": {
                    [groupId]: {
                        "access": "rw------",
                        "id": groupId
                    }
                }
            };
        }
    }
}

// ============================================================
// 4. UI HELPERS
// ============================================================

function showNotification(message, type = "info") {
    const container = el("notificationContainer");
    const notification = document.createElement("div");
    notification.className = "notification notification-" + type;

    const text = document.createElement("span");
    text.textContent = message;
    notification.appendChild(text);

    const closeBtn = document.createElement("button");
    closeBtn.className = "notification-close";
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", function () {
        notification.remove();
    });
    notification.appendChild(closeBtn);

    container.appendChild(notification);

    if (type === "info" || type === "success") {
        setTimeout(function () {
            if (notification.parentNode) notification.remove();
        }, 5000);
    }
}

function showLoading() {
    el("loadingOverlay").style.display = "";
}

function hideLoading() {
    el("loadingOverlay").style.display = "none";
}

function showModal(modalId) {
    el(modalId).style.display = "";
}

function hideModal(modalId) {
    el(modalId).style.display = "none";
}

function switchTab(tabName) {
    const tabs = document.querySelectorAll(".dhis2-tab");
    tabs.forEach(function (tab) {
        if (tab.dataset.tab === tabName) {
            tab.classList.add("active");
        } else {
            tab.classList.remove("active");
        }
    });
    const sections = document.querySelectorAll(".tab-content");
    sections.forEach(function (section) {
        if (section.id === "tab-" + tabName) {
            section.classList.add("active");
        } else {
            section.classList.remove("active");
        }
    });
}

// ============================================================
// 5a. METADATA DELETION HELPERS
// ============================================================

/**
 * Build a map from placeholder key (e.g. "§DE_NOUTLIER_VAL§") to
 * { name, description, shortName, kind } from the template functions.
 */
function collectTemplateEntries() {
    var map = {};
    var bundles = [templateOutlier(), templateConsistency(), templateCompleteness(), templateCompletenessDisaggregated()];
    for (var b = 0; b < bundles.length; b++) {
        var bundle = bundles[b];
        var kinds = ["dataElements", "predictors", "indicators"];
        for (var k = 0; k < kinds.length; k++) {
            var kind = kinds[k];
            var entries = bundle[kind] || [];
            for (var e = 0; e < entries.length; e++) {
                var entry = entries[e];
                if (entry.id && entry.id.indexOf("\u00a7") === 0) {
                    // Predictors have no top-level description; their human-readable
                    // description lives in generator.description.
                    var descTemplate = entry.description
                        || (entry.generator && entry.generator.description)
                        || null;
                    map[entry.id] = {
                        name: entry.name,
                        description: descTemplate,
                        shortName: entry.shortName,
                        kind: kind.slice(0, -1) // "dataElement" | "predictor" | "indicator"
                    };
                }
            }
        }
    }
    return map;
}

/**
 * Convert a template string (containing §PLACEHOLDER§ tokens) into a
 * regex that matches any substitution at those positions.
 */
function templateToRegex(templateStr) {
    var parts = templateStr.split(/\u00a7[^\u00a7]*\u00a7/);
    var pattern = parts
        .map(function (p) { return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); })
        .join(".*?");
    return new RegExp("^" + pattern + "$");
}

/**
 * Derive the metadata kind from a placeholder key prefix.
 * Returns "dataElement" | "predictor" | "indicator" | null.
 */
function kindFromPlaceholder(placeholderKey) {
    if (placeholderKey.indexOf("\u00a7DE_") === 0) return "dataElement";
    if (placeholderKey.indexOf("\u00a7PD_") === 0) return "predictor";
    if (placeholderKey.indexOf("\u00a7IN_") === 0) return "indicator";
    return null;
}

/**
 * Build candidate lists for each check type from the stored config entries.
 * Returns { outliers: [{id, placeholderKey, kind}, ...], consistency: [...], completeness: [...] }
 * Only includes values that look like real UIDs (string, length 11).
 */
function buildCandidateSets(outlierEntry, consistencyEntry, completenessEntry, deId) {
    var sets = {};
    var labelMaps = {
        outliers: OUTLIER_METADATA_LABELS,
        consistency: CONSISTENCY_METADATA_LABELS,
        completeness: COMPLETENESS_METADATA_LABELS
    };
    var entries = {
        outliers: outlierEntry ? outlierEntry[deId] : null,
        consistency: consistencyEntry ? consistencyEntry[deId] : null,
        completeness: null
    };
    if (completenessEntry) {
        var cKey = Object.keys(completenessEntry)[0];
        entries.completeness = completenessEntry[cKey];
    }

    for (var checkType in labelMaps) {
        var cfg = entries[checkType];
        if (!cfg) continue;
        var candidates = [];
        var lm = labelMaps[checkType];
        for (var placeholder in lm) {
            var val = cfg[placeholder];
            if (typeof val === "string" && val.length === 11) {
                var kind = kindFromPlaceholder(placeholder);
                if (kind) {
                    candidates.push({ id: val, placeholderKey: placeholder, kind: kind });
                }
            }
        }
        if (candidates.length > 0) {
            sets[checkType] = candidates;
        }
    }
    return sets;
}

/**
 * Fetch the member IDs of each app-managed group, bucketed by metadata kind.
 * Returns { dataElement: Set, predictor: Set, indicator: Set }.
 */
async function fetchOwnedIds(config) {
    var owned = { dataElement: new Set(), predictor: new Set(), indicator: new Set() };

    // Data element group
    try {
        var deGroup = await d2Get("/api/dataElementGroups/" + config.dataElementGroup + "?fields=dataElements[id]&paging=false");
        (deGroup.dataElements || []).forEach(function (o) { owned.dataElement.add(o.id); });
    } catch (e) {
        console.warn("fetchOwnedIds: failed to fetch dataElementGroup", e);
    }

    // Indicator group
    try {
        var inGroup = await d2Get("/api/indicatorGroups/" + config.indicatorGroup + "?fields=indicators[id]&paging=false");
        (inGroup.indicators || []).forEach(function (o) { owned.indicator.add(o.id); });
    } catch (e) {
        console.warn("fetchOwnedIds: failed to fetch indicatorGroup", e);
    }

    // All predictor groups
    var pdGroupIds = [
        config.predictorGroup,
        config.predictorGroupThreshold,
        config.predictorGroupAnalysis,
        config.predictorGroupConsistency
    ].filter(Boolean);
    // Deduplicate
    var seen = {};
    var uniquePdGroupIds = [];
    for (var i = 0; i < pdGroupIds.length; i++) {
        if (!seen[pdGroupIds[i]]) {
            seen[pdGroupIds[i]] = true;
            uniquePdGroupIds.push(pdGroupIds[i]);
        }
    }
    for (var j = 0; j < uniquePdGroupIds.length; j++) {
        try {
            var pdGroup = await d2Get("/api/predictorGroups/" + uniquePdGroupIds[j] + "?fields=predictors[id]&paging=false");
            (pdGroup.predictors || []).forEach(function (o) { owned.predictor.add(o.id); });
        } catch (e) {
            console.warn("fetchOwnedIds: failed to fetch predictorGroup " + uniquePdGroupIds[j], e);
        }
    }

    return owned;
}

/**
 * Evaluate a single check type's candidates against all four safety gates.
 * Returns { ok: boolean, failures: [{id, placeholderKey, kind, reason}, ...] }.
 */
async function evaluateCheckForDeletion(candidates, config, ownedIds, templateMap) {
    var failures = [];

    // Gate 1: Ownership — each candidate must be in the app-managed group
    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (!ownedIds[c.kind] || !ownedIds[c.kind].has(c.id)) {
            failures.push({ id: c.id, placeholderKey: c.placeholderKey, kind: c.kind, reason: "not owned by app" });
        }
    }
    if (failures.length > 0) return { ok: false, failures: failures };

    // Gate 2: Edit-time — batch-fetch items, check lastUpdated - created < 5000ms
    var endpointByKind = { dataElement: "dataElements", predictor: "predictors", indicator: "indicators" };
    // Predictor descriptions live in generator.description, not top-level.
    var fieldsByKind = {
        dataElement: "id,name,description,created,lastUpdated",
        predictor: "id,name,generator[description],created,lastUpdated",
        indicator: "id,name,description,created,lastUpdated"
    };
    var fetchedByKind = {}; // kind -> { id -> item }
    var kindsPresent = {};
    for (var ci = 0; ci < candidates.length; ci++) {
        kindsPresent[candidates[ci].kind] = true;
    }
    for (var kind in kindsPresent) {
        var ids = candidates.filter(function (c) { return c.kind === kind; }).map(function (c) { return c.id; });
        var endpoint = endpointByKind[kind];
        var result = await d2Get("/api/" + endpoint + "?filter=id:in:[" + ids.join(",") + "]&fields=" + fieldsByKind[kind] + "&paging=false");
        var items = result[endpoint] || [];
        var itemMap = {};
        for (var ii = 0; ii < items.length; ii++) {
            itemMap[items[ii].id] = items[ii];
        }
        fetchedByKind[kind] = itemMap;

        // Check for missing items (deleted out-of-band)
        for (var mi = 0; mi < ids.length; mi++) {
            if (!itemMap[ids[mi]]) {
                var missingCandidate = candidates.find(function (c) { return c.id === ids[mi]; });
                failures.push({ id: ids[mi], placeholderKey: missingCandidate.placeholderKey, kind: kind, reason: "no longer exists" });
            }
        }
    }
    if (failures.length > 0) return { ok: false, failures: failures };

    // Check edit-time threshold
    for (var ti = 0; ti < candidates.length; ti++) {
        var tc = candidates[ti];
        var item = fetchedByKind[tc.kind][tc.id];
        var created = new Date(item.created).getTime();
        var lastUpdated = new Date(item.lastUpdated).getTime();
        if (lastUpdated - created >= 5000) {
            failures.push({ id: tc.id, placeholderKey: tc.placeholderKey, kind: tc.kind, reason: "modified after creation" });
        }
    }
    if (failures.length > 0) return { ok: false, failures: failures };

    // Gate 3: Template match — name and description must match the template regex
    // Predictors' description lives in generator.description; other kinds use top-level.
    for (var tmi = 0; tmi < candidates.length; tmi++) {
        var tmc = candidates[tmi];
        var tmItem = fetchedByKind[tmc.kind][tmc.id];
        var tmpl = templateMap[tmc.placeholderKey];
        if (!tmpl || !tmpl.name) {
            failures.push({ id: tmc.id, placeholderKey: tmc.placeholderKey, kind: tmc.kind, reason: "no template found for placeholder" });
            continue;
        }
        var nameRegex = templateToRegex(tmpl.name);
        if (!nameRegex.test(tmItem.name || "")) {
            failures.push({ id: tmc.id, placeholderKey: tmc.placeholderKey, kind: tmc.kind, reason: "name no longer matches template" });
            continue;
        }
        // Description check only if the template has one
        if (tmpl.description) {
            var currentDesc = tmc.kind === "predictor"
                ? ((tmItem.generator && tmItem.generator.description) || "")
                : (tmItem.description || "");
            var descRegex = templateToRegex(tmpl.description);
            if (!descRegex.test(currentDesc)) {
                failures.push({ id: tmc.id, placeholderKey: tmc.placeholderKey, kind: tmc.kind, reason: "description no longer matches template" });
            }
        }
    }
    if (failures.length > 0) return { ok: false, failures: failures };

    // Gate 4: Dry-run DELETE — POST /api/metadata?importStrategy=DELETE&dryRun=true&atomicMode=NONE
    var dryRunPayload = { dataElements: [], predictors: [], indicators: [] };
    for (var dri = 0; dri < candidates.length; dri++) {
        var drc = candidates[dri];
        var pluralKind = drc.kind + "s";
        dryRunPayload[pluralKind].push({ id: drc.id });
    }
    // Remove empty arrays
    if (dryRunPayload.dataElements.length === 0) delete dryRunPayload.dataElements;
    if (dryRunPayload.predictors.length === 0) delete dryRunPayload.predictors;
    if (dryRunPayload.indicators.length === 0) delete dryRunPayload.indicators;

    var dryRunResult;
    try {
        dryRunResult = await d2PostJson(
            "/api/metadata?importStrategy=DELETE&dryRun=true&atomicMode=NONE",
            dryRunPayload
        );
    } catch (dryRunErr) {
        // DHIS2 returns 4xx when the import report contains conflicts; d2PostJson
        // throws with only the top-level message and we lose the per-item detail.
        // Be conservative: if the dry-run cannot succeed, treat every candidate in
        // this check as "referenced elsewhere" and surface the generic DHIS2
        // message for the first failure.
        for (var drEi = 0; drEi < candidates.length; drEi++) {
            var drEc = candidates[drEi];
            failures.push({
                id: drEc.id,
                placeholderKey: drEc.placeholderKey,
                kind: drEc.kind,
                reason: "referenced elsewhere (dry-run: " + dryRunErr.message + ")"
            });
        }
        return { ok: false, failures: failures };
    }

    // Walk typeReports to find errors
    var typeReports = (dryRunResult && dryRunResult.typeReports) || [];
    var errorIds = {};
    for (var tri = 0; tri < typeReports.length; tri++) {
        var objectReports = (typeReports[tri].objectReports || []);
        for (var ori = 0; ori < objectReports.length; ori++) {
            var objReport = objectReports[ori];
            if (objReport.errorReports && objReport.errorReports.length > 0) {
                errorIds[objReport.uid] = objReport.errorReports[0].message || "dry-run conflict";
            }
        }
    }
    for (var eri = 0; eri < candidates.length; eri++) {
        var erc = candidates[eri];
        if (errorIds[erc.id]) {
            failures.push({ id: erc.id, placeholderKey: erc.placeholderKey, kind: erc.kind, reason: "referenced elsewhere (" + errorIds[erc.id] + ")" });
        }
    }

    return { ok: failures.length === 0, failures: failures };
}

/**
 * Build a human-readable label for a placeholder from the METADATA_LABELS maps.
 */
function labelForPlaceholder(placeholderKey) {
    var allMaps = [OUTLIER_METADATA_LABELS, CONSISTENCY_METADATA_LABELS, COMPLETENESS_METADATA_LABELS];
    for (var i = 0; i < allMaps.length; i++) {
        if (allMaps[i][placeholderKey]) {
            return allMaps[i][placeholderKey][1];
        }
    }
    return placeholderKey;
}

// ============================================================
// 5b. METADATA CONFIGURATION
// ============================================================

async function configureConsistencyMetadata(deSource) {
    let consistencyConfig = {
        "§NAME§": deSource.name,
        "§SHORTNAME§": deSource.shortName.length > 28 ? deSource.shortName.substring(0, 28) : deSource.shortName,
        "§DE_SOURCE§": deSource.id,
        "§IN_TYPE§": await indicatorTypePercentId(),
        "§COC_DEFAULT§": await defaultCoCId(),
        "§OU_LEVEL§": el("selectOuLevel").value,
        "§DE_CONS_ALL§": false,
        "§DE_CONS_ANY§": false,
        "§IN_CONS_PROP§": false,
        "§PD_CONS_ALL§": false,
        "§PD_CONS_ANY§": false
    };

    let uids = await generateUids(6);
    let templateText = JSON.stringify(templateConsistency());

    for (let prop in consistencyConfig) {
        if (!consistencyConfig[prop]) consistencyConfig[prop] = uids.pop();
        let search = new RegExp(prop, "g");
        let replace = consistencyConfig[prop];
        templateText = templateText.replace(search, replace);
    }

    let consistencyImport = JSON.parse(templateText);
    shareMetadata(consistencyImport, baseConfig["userGroup"]);

    currentImport = {
        ...currentImport,
        "consistencyImport": consistencyImport,
        "consistencyConfig": consistencyConfig
    };

    return consistencyImport;
}

async function configureCompletenessMetadata(deSource, dsSource) {
    let completenessConfig = {
        "§NAME§": deSource.name,
        "§SHORTNAME§": deSource.shortName.length > 30 ? deSource.shortName.substring(0, 30) : deSource.shortName,
        "§NAME_DS§": dsSource.name,
        "§DE_SOURCE§": deSource.id,
        "§DS_SOURCE§": dsSource.id,
        "§IN_TYPE§": await indicatorTypePercentId(),
        "§IN_COMPL§": false
    };

    let uids = await generateUids(6);
    let templateText = JSON.stringify(templateCompleteness());

    for (let prop in completenessConfig) {
        if (!completenessConfig[prop]) completenessConfig[prop] = uids.pop();
        let search = new RegExp(prop, "g");
        let replace = completenessConfig[prop];
        templateText = templateText.replace(search, replace);
    }

    let completenessImport = JSON.parse(templateText);
    shareMetadata(completenessImport, baseConfig["userGroup"]);

    currentImport = {
        ...currentImport,
        "completenessImport": completenessImport,
        "completenessConfig": completenessConfig
    };

    return completenessImport;
}

async function configureCompletenessDisaggregatedMetadata(deSource, dsSource) {
    let completenessConfig = {
        "§NAME§": deSource.name,
        "§SHORTNAME§": deSource.shortName.length > 30 ? deSource.shortName.substring(0, 30) : deSource.shortName,
        "§NAME_DS§": dsSource.name,
        "§DE_SOURCE§": deSource.id,
        "§DS_SOURCE§": dsSource.id,
        "§COC_DEFAULT§": await defaultCoCId(),
        "§IN_TYPE§": await indicatorTypePercentId(),
        "§OU_LEVEL§": el("selectOuLevel").value,
        "§DE_COMPL_ANY§": false,
        "§PD_COMPL_ANY§": false,
        "§IN_COMPL_ANY§": false
    };

    let uids = await generateUids(6);
    let templateText = JSON.stringify(templateCompletenessDisaggregated());

    for (let prop in completenessConfig) {
        if (!completenessConfig[prop]) completenessConfig[prop] = uids.pop();
        let search = new RegExp(prop, "g");
        let replace = completenessConfig[prop];
        templateText = templateText.replace(search, replace);
    }

    let completenessImport = JSON.parse(templateText);
    shareMetadata(completenessImport, baseConfig["userGroup"]);

    currentImport = {
        ...currentImport,
        "completenessImport": completenessImport,
        "completenessConfig": completenessConfig
    };

    return completenessImport;
}

async function configureOutlierMetadata(deSource) {
    let outlierConfig = {
        "§NAME§": deSource.name,
        "§SHORTNAME§": deSource.shortName.length > 34 ? deSource.shortName.substring(0, 35) : deSource.shortName,
        "§DE_SOURCE§": deSource.id,
        "§COC_DEFAULT§": await defaultCoCId(),
        "§IN_TYPE§": await indicatorTypePercentId(),
        "§OU_LEVEL§": el("selectOuLevel").value,
        "§VAL_STDDEV§": el("selectThreshold").value,
        "§DE_NOUTLIER_COUNT§": false,
        "§DE_NOUTLIER_VAL§": false,
        "§DE_OUTLIER_COUNT§": false,
        "§DE_OUTLIER_VAL§": false,
        "§DE_THRESHOLD§": false,
        "§IN_NOUTLIER_PROP§": false,
        "§IN_OUTLIER_PROP§": false,
        "§PD_NOUTLIER_COUNT§": false,
        "§PD_NOUTLIER_VAL§": false,
        "§PD_OUTLIER_COUNT§": false,
        "§PD_OUTLIER_VAL§": false,
        "§PD_THRESHOLD§": false
    };

    let uids = await generateUids(12);
    let templateText = JSON.stringify(templateOutlier());

    for (let prop in outlierConfig) {
        if (!outlierConfig[prop]) outlierConfig[prop] = uids.pop();
        let search = new RegExp(prop, "g");
        let replace = outlierConfig[prop];
        templateText = templateText.replace(search, replace);
    }

    let outlierImport = JSON.parse(templateText);
    shareMetadata(outlierImport, baseConfig["userGroup"]);

    currentImport = {
        ...currentImport,
        "outlierImport": outlierImport,
        "outlierConfig": outlierConfig
    };

    return outlierImport;
}

// ============================================================
// 6. METADATA GROUP MANAGEMENT
// ============================================================

async function addToDeGroup(groupId, dataElements) {
    let group = await d2Get("/api/dataElementGroups/" + groupId + "?fields=:owner");
    for (const de of dataElements) {
        group.dataElements.push({ "id": de.id });
    }
    return await d2PutJson("/api/dataElementGroups/" + groupId, group);
}

async function addToInGroup(groupId, indicators) {
    let group = await d2Get("/api/indicatorGroups/" + groupId + "?fields=:owner");
    for (const ind of indicators) {
        group.indicators.push({ "id": ind.id });
    }
    return await d2PutJson("/api/indicatorGroups/" + groupId, group);
}

async function addToPdGroup(groupId, predictors) {
    let group = await d2Get("/api/predictorGroups/" + groupId + "?fields=:owner");
    for (const pd of predictors) {
        group.predictors.push({ "id": pd.id });
    }
    return await d2PutJson("/api/predictorGroups/" + groupId, group);
}

async function removeFromDeGroup(groupId, dataElements) {
    let group = await d2Get("/api/dataElementGroups/" + groupId + "?fields=:owner");
    group.dataElements = group.dataElements.filter(function (de) {
        return !hasObject(dataElements, "id", de.id);
    });
    return await d2PutJson("/api/dataElementGroups/" + groupId, group);
}

async function removeFromInGroup(groupId, indicators) {
    let group = await d2Get("/api/indicatorGroups/" + groupId + "?fields=:owner");
    group.indicators = group.indicators.filter(function (ind) {
        return !hasObject(indicators, "id", ind.id);
    });
    return await d2PutJson("/api/indicatorGroups/" + groupId, group);
}

async function removeFromPdGroup(groupId, predictors) {
    let group = await d2Get("/api/predictorGroups/" + groupId + "?fields=:owner");
    group.predictors = group.predictors.filter(function (pd) {
        return !hasObject(predictors, "id", pd.id);
    });
    return await d2PutJson("/api/predictorGroups/" + groupId, group);
}

function splitOutlierPredictors(outlierConfig, predictors) {
    let result = {
        "threshold": [],
        "analysis": []
    };
    for (const p of predictors) {
        if (outlierConfig["§PD_THRESHOLD§"] == p["id"]) result.threshold.push(p);
        else result.analysis.push(p);
    }
    return result;
}

// ============================================================
// 7. IMPORT FUNCTIONS
// ============================================================

async function importOutlier() {
    let outlierConfig = currentImport["outlierConfig"];
    let outlierImport = currentImport["outlierImport"];
    let importResult, addGroups = false, results = [];

    try {
        importResult = await d2PostJson("/api/metadata", outlierImport);
        results.push(["Outlier - Metadata import", importResult["status"]]);
        addGroups = true;
    } catch (error) {
        results.push(["Outlier - Metadata import", error["status"]]);
    }

    if (addGroups) {
        try {
            importResult = await addToDeGroup(baseConfig.dataElementGroup, outlierImport.dataElements);
            results.push(["Outlier - Add to data element group", importResult["status"]]);
            importResult = await addToInGroup(baseConfig.indicatorGroup, outlierImport.indicators);
            results.push(["Outlier - Add to indicator group", importResult["status"]]);
            importResult = await addToPdGroup(baseConfig.predictorGroup, outlierImport.predictors);
            results.push(["Outlier - Add to general predictor group", importResult["status"]]);
            importResult = await addToPdGroup(baseConfig.predictorGroupThreshold, splitOutlierPredictors(outlierConfig, outlierImport.predictors)["threshold"]);
            results.push(["Outlier - Add to threshold predictor group", importResult["status"]]);
            importResult = await addToPdGroup(baseConfig.predictorGroupAnalysis, splitOutlierPredictors(outlierConfig, outlierImport.predictors)["analysis"]);
            results.push(["Outlier - Add to analysis predictor group", importResult["status"]]);
        } catch (error) {
            results.push(["Outlier - Add to groups", error["status"]]);
        }
        try {
            let outlierStore = await d2Get("/api/dataStore/dqConfig/outliers");
            outlierStore.push({
                [outlierConfig["§DE_SOURCE§"]]: outlierConfig
            });
            importResult = await d2PutJson("/api/dataStore/dqConfig/outliers", outlierStore);
            results.push(["Outlier - Save DQ helper config", importResult["status"]]);
        } catch (error) {
            results.push(["Outlier - Save DQ helper config", error["status"]]);
        }
    }

    return results;
}

async function importConsistency() {
    let consistencyConfig = currentImport["consistencyConfig"];
    let consistencyImport = currentImport["consistencyImport"];
    let importResult, addGroups = false, results = [];

    try {
        importResult = await d2PostJson("/api/metadata", consistencyImport);
        results.push(["Consistency - Metadata import", importResult["status"]]);
        addGroups = true;
    } catch (error) {
        results.push(["Consistency - Metadata import", error["status"]]);
    }

    if (addGroups) {
        try {
            importResult = await addToDeGroup(baseConfig.dataElementGroup, consistencyImport.dataElements);
            results.push(["Consistency - Add to data element group", importResult["status"]]);
            importResult = await addToInGroup(baseConfig.indicatorGroup, consistencyImport.indicators);
            results.push(["Consistency - Add to indicator group", importResult["status"]]);
            importResult = await addToPdGroup(baseConfig.predictorGroup, consistencyImport.predictors);
            results.push(["Consistency - Add to general predictor group", importResult["status"]]);
            importResult = await addToPdGroup(baseConfig.predictorGroupConsistency, consistencyImport.predictors);
            results.push(["Consistency - Add to consistency predictor group", importResult["status"]]);
        } catch (error) {
            results.push(["Consistency - Add to groups", error["status"]]);
        }
        try {
            let consistencyStore = await d2Get("/api/dataStore/dqConfig/consistency");
            consistencyStore.push({
                [consistencyConfig["§DE_SOURCE§"]]: consistencyConfig
            });
            importResult = await d2PutJson("/api/dataStore/dqConfig/consistency", consistencyStore);
            results.push(["Consistency - Save DQ helper config", importResult["status"]]);
        } catch (error) {
            results.push(["Consistency - Save DQ helper config", error["status"]]);
        }
    }

    return results;
}

async function importCompleteness() {
    let completenessConfig = currentImport["completenessConfig"];
    let completenessImport = currentImport["completenessImport"];
    let importResult, addGroups = false, results = [];

    try {
        importResult = await d2PostJson("/api/metadata", completenessImport);
        results.push(["Completeness - Metadata import", importResult["status"]]);
        addGroups = true;
    } catch (error) {
        results.push(["Completeness - Metadata import", "Error " + error["status"]]);
    }

    if (addGroups) {
        try {
            importResult = await addToInGroup(baseConfig.indicatorGroup, completenessImport.indicators);
            results.push(["Completeness - Add to indicator group", importResult["status"]]);
        } catch (error) {
            results.push(["Completeness - Add to groups", error["status"]]);
        }
        try {
            let completenessStore = await d2Get("/api/dataStore/dqConfig/completeness");
            completenessStore.push({
                [completenessConfig["§DE_SOURCE§"]]: completenessConfig
            });
            importResult = await d2PutJson("/api/dataStore/dqConfig/completeness", completenessStore);
            results.push(["Completeness - Save DQ helper config", importResult["status"]]);
        } catch (error) {
            results.push(["Completeness - Save DQ helper config", error["status"]]);
        }
    }

    return results;
}

// ============================================================
// 8. PREVIEW + UI RENDERING
// ============================================================

async function makeSelect(objectName, filterString) {
    let apiString = "/api/" + objectName;
    if (filterString) apiString += filterString;
    let result = await d2Get(apiString);
    let html = "";
    for (const obj of result[objectName]) {
        html += "<option value='" + obj.id + "'>" + obj.displayName + "</option>";
    }
    return html;
}

function makeTable(objects, properties) {
    let htmlCode = "<table class='dhis2-table'><tr>";
    for (const prop of properties) {
        htmlCode += "<th>" + prop + "</th>";
    }
    for (const obj of objects) {
        htmlCode += "</tr><tr>";
        for (const prop of properties) {
            let nestedObj = JSON.parse(JSON.stringify(obj));
            let parts = prop.split("[");
            for (let part of parts) {
                part = part.replace("]", "");
                nestedObj = nestedObj[part];
            }
            htmlCode += "<td>" + nestedObj + "</td>";
        }
    }
    htmlCode += "</tr></table>";
    return htmlCode;
}

function previewTable(objects, properties) {
    if (!objects || objects.length === 0) {
        return "<p style=\"color: var(--dhis2-text-secondary); font-style: italic;\">N/A</p>";
    }
    return makeTable(objects, properties);
}

function generateResultsTable(results) {
    let htmlCode = "<table class='dhis2-table'><tr><th>Import</th><th>Status</th></tr>";
    for (const row of results) {
        const isSuccess = row[1] === "SUCCESS" || row[1] === "OK";
        const statusClass = isSuccess ? "result-success" : "result-error";
        htmlCode += "<tr class='" + statusClass + "'><td>" + row[0] + "</td><td>" + row[1] + "</td></tr>";
    }
    htmlCode += "</table>";
    return htmlCode;
}

async function makeSelectOuLevel() {
    const dataSetId = el("selectDataSet").value;

    // Levels at which the dataSet is actually assigned (enabled options)
    const dataSetData = await d2Get("/api/dataSets/" + dataSetId + "?fields=organisationUnits[level]");
    const assignedLevels = new Set();
    for (const ou of dataSetData["organisationUnits"] || []) {
        if (ou.level > 1) assignedLevels.add(ou.level);
    }

    // All system levels (level > 1, excluding national)
    const levelsData = await d2Get("/api/organisationUnitLevels?fields=id,level,displayName&paging=false");
    const allLevels = [...levelsData["organisationUnitLevels"]]
        .filter(function (lvl) { return lvl.level > 1; })
        .sort(function (a, b) { return a.level - b.level; });

    let htmlCode = "";
    for (const lvl of allLevels) {
        const isAssigned = assignedLevels.has(lvl.level);
        const disabledAttr = isAssigned ? "" : " disabled";
        const suffix = isAssigned ? "" : " (not assigned to data set)";
        htmlCode += "<option value='" + lvl.id + "'" + disabledAttr + ">" +
            "Level " + lvl.level + " - " + lvl.displayName + suffix + "</option>";
    }
    el("selectOuLevel").innerHTML = htmlCode;
    el("selectOuLevel").selectedIndex = -1;
    resetSelectFilter("filterOuLevel", "selectOuLevel");
}

function previewPossible() {
    const dsId = el("selectDataSet").value;
    const deId = el("selectDataElement").value;
    const ouLvl = el("selectOuLevel").value;
    const threshold = el("selectThreshold").value;

    const meta = deId ? dataElementMetaMap[deId] : null;
    const deIsDisaggregated = meta && meta.catComboName.toLowerCase() !== "default";
    const disagg = el("selectDisaggregation").value;
    // "Total" means the user will also configure completeness on aggregated data
    const isTotal = deIsDisaggregated && disagg === "__total__";
    const isProxyApproach = isTotal && el("proxyApproach").checked;
    const deOperandId = isProxyApproach ? el("selectDataElementOperand").value : true;

    // When DE is disaggregated, a disaggregation choice must be made
    const hasDisaggChoice = !deIsDisaggregated || disagg !== "";

    const isSelectionValid = dsId &&
        deId &&
        hasDisaggChoice &&
        ouLvl &&
        threshold &&
        (!isTotal || (isProxyApproach ? deOperandId : true));

    el("buttonPreview").disabled = !isSelectionValid;
}

async function previewConfiguration() {
    el("buttonPreview").disabled = true;
    showLoading();

    try {
        el("resultSection").style.display = "none";
        el("previewSection").style.display = "none";
        currentImport = {};

        const deSourceId = effectiveDeSourceId();
        const dsSourceId = el("selectDataSet").value;

        let dataElement;
        if (deSourceId.length === 23) {
            const dataElementOperands = await d2Get("/api/dataElementOperands?filter=id:eq:" + deSourceId + "&fields=name,shortName,id");
            dataElement = dataElementOperands["dataElementOperands"][0];
        } else {
            dataElement = await d2Get("/api/dataElements/" + deSourceId + "?fields=name,shortName,id");
        }

        let dataSet = await d2Get("/api/dataSets/" + dsSourceId + "?fields=name,shortName,id,periodType");
        if (dataSet.periodType != "Monthly") {
            showNotification("Only monthly data sets are automatically supported. Configuration of this dataset must be updated manually.", "warning");
        }

        // Outlier
        let outlierMetadata = await configureOutlierMetadata(dataElement);
        el("dataElementPreviewOutlier").innerHTML = previewTable(outlierMetadata["dataElements"], ["name", "shortName", "description"]);
        el("predictorPreviewOutlier").innerHTML = previewTable(outlierMetadata["predictors"], ["name", "shortName", "generator[expression]"]);
        el("indicatorPreviewOutlier").innerHTML = previewTable(outlierMetadata["indicators"], ["name", "numeratorDescription", "numerator", "denominatorDescription", "denominator"]);

        // Consistency
        let consistencyMetadata = await configureConsistencyMetadata(dataElement);
        el("dataElementPreviewConsistency").innerHTML = previewTable(consistencyMetadata["dataElements"], ["name", "shortName", "description"]);
        el("predictorPreviewConsistency").innerHTML = previewTable(consistencyMetadata["predictors"], ["name", "shortName", "generator[expression]"]);
        el("indicatorPreviewConsistency").innerHTML = previewTable(consistencyMetadata["indicators"], ["name", "numeratorDescription", "numerator", "denominatorDescription", "denominator"]);

        // Completeness
        let completenessMetadata;
        // Completeness section is visible only when user picked "Total" for a disaggregated DE
        const needsCompletenessApproach = el("completenessSection").style.display !== "none";

        if (needsCompletenessApproach) {
            const isProxyApproach = el("proxyApproach").checked;
            if (isProxyApproach) {
                const deoSourceId = el("selectDataElementOperand").value;
                const dataElementOperands = await d2Get("/api/dataElementOperands?filter=id:eq:" + deoSourceId + "&fields=name,shortName,id");
                dataElement = dataElementOperands["dataElementOperands"][0];
                completenessMetadata = await configureCompletenessMetadata(dataElement, dataSet);
            } else {
                completenessMetadata = await configureCompletenessDisaggregatedMetadata(dataElement, dataSet);
            }
        } else {
            completenessMetadata = await configureCompletenessMetadata(dataElement, dataSet);
        }

        el("dataElementPreviewCompleteness").innerHTML = previewTable(completenessMetadata["dataElements"], ["name", "shortName", "description"]);
        el("predictorPreviewCompleteness").innerHTML = previewTable(completenessMetadata["predictors"], ["name", "shortName", "generator[expression]"]);
        el("indicatorPreviewCompleteness").innerHTML = previewTable(completenessMetadata["indicators"], ["name", "numeratorDescription", "numerator", "denominatorDescription", "denominator"]);

        el("previewSection").style.display = "";
        el("buttonImport").disabled = false;
    } catch (error) {
        console.error("Preview configuration failed:", error);
        showNotification("Failed to preview configuration: " + error.message, "error");
    } finally {
        hideLoading();
        previewPossible();
    }
}

// ============================================================
// 9. CONFIGURATION OVERVIEW
// ============================================================

// Cache for org unit level lookups (id → name)
let cachedOuLevels = null;

async function getOuLevelMap() {
    if (cachedOuLevels) return cachedOuLevels;
    const data = await d2Get("/api/organisationUnitLevels?fields=id,level,displayName&paging=false");
    cachedOuLevels = {};
    for (const lvl of data["organisationUnitLevels"]) {
        // The dataStore stores the organisationUnitLevel ID (UID) — map ID → "Level N - Name"
        cachedOuLevels[lvl.id] = "Level " + lvl.level + " - " + lvl.displayName;
    }
    return cachedOuLevels;
}

// Categories of metadata stored in each config type, mapped to readable labels
const OUTLIER_METADATA_LABELS = {
    "\u00a7DE_NOUTLIER_VAL\u00a7": ["dataElement", "Excluding outliers (data element)"],
    "\u00a7DE_NOUTLIER_COUNT\u00a7": ["dataElement", "Non-outlier count (data element)"],
    "\u00a7DE_OUTLIER_COUNT\u00a7": ["dataElement", "Outlier count (data element)"],
    "\u00a7DE_OUTLIER_VAL\u00a7": ["dataElement", "Outlier values (data element)"],
    "\u00a7DE_THRESHOLD\u00a7": ["dataElement", "Outlier threshold (data element)"],
    "\u00a7PD_NOUTLIER_VAL\u00a7": ["predictor", "Excluding outliers (predictor)"],
    "\u00a7PD_NOUTLIER_COUNT\u00a7": ["predictor", "Non-outlier count (predictor)"],
    "\u00a7PD_OUTLIER_COUNT\u00a7": ["predictor", "Outlier count (predictor)"],
    "\u00a7PD_OUTLIER_VAL\u00a7": ["predictor", "Outlier values (predictor)"],
    "\u00a7PD_THRESHOLD\u00a7": ["predictor", "Outlier threshold (predictor)"],
    "\u00a7IN_NOUTLIER_PROP\u00a7": ["indicator", "Excluding outliers (%)"],
    "\u00a7IN_OUTLIER_PROP\u00a7": ["indicator", "Values that are outliers (%)"]
};

const CONSISTENCY_METADATA_LABELS = {
    "\u00a7DE_CONS_ALL\u00a7": ["dataElement", "Reported all 12 months (data element)"],
    "\u00a7DE_CONS_ANY\u00a7": ["dataElement", "Reported any of last 12 months (data element)"],
    "\u00a7PD_CONS_ALL\u00a7": ["predictor", "Reported all 12 months (predictor)"],
    "\u00a7PD_CONS_ANY\u00a7": ["predictor", "Reported any of last 12 months (predictor)"],
    "\u00a7IN_CONS_PROP\u00a7": ["indicator", "Consistent reporting (%)"]
};

const COMPLETENESS_METADATA_LABELS = {
    "\u00a7IN_COMPL\u00a7": ["indicator", "Completeness (%)"],
    "\u00a7DE_COMPL_ANY\u00a7": ["dataElement", "Reported any disaggregation (data element)"],
    "\u00a7PD_COMPL_ANY\u00a7": ["predictor", "Reported any disaggregation (predictor)"],
    "\u00a7IN_COMPL_ANY\u00a7": ["indicator", "Completeness any disaggregation (%)"]
};

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function buildMetadataDetails(config, labelMap) {
    const items = [];
    for (const key in labelMap) {
        const id = config[key];
        if (id) {
            items.push({
                type: labelMap[key][0],
                label: labelMap[key][1],
                id: id
            });
        }
    }
    return items;
}

async function listConfig() {
    try {
        const outliers = await d2Get("/api/dataStore/dqConfig/outliers");
        const completeness = await d2Get("/api/dataStore/dqConfig/completeness");
        const consistency = await d2Get("/api/dataStore/dqConfig/consistency");
        const ouLevelMap = await getOuLevelMap();

        // Create a map of all configured data elements
        const configuredElements = new Map();

        // Helper function to add configuration to the map
        const addToMap = function (array, type) {
            array.forEach(function (item) {
                const entries = Object.entries(item);
                const id = entries[0][0];
                const config = entries[0][1];

                if (type === "completeness") {
                    const baseId = id.split(".")[0];

                    if (configuredElements.has(id)) {
                        configuredElements.get(id).configs[type] = config;
                        configuredElements.get(id).dataSet = config["\u00a7NAME_DS\u00a7"];
                    } else if (configuredElements.has(baseId)) {
                        configuredElements.get(baseId).configs[type] = config;
                        configuredElements.get(baseId).dataSet = config["\u00a7NAME_DS\u00a7"];
                    } else {
                        configuredElements.set(baseId, {
                            name: config["\u00a7NAME\u00a7"],
                            dataSet: config["\u00a7NAME_DS\u00a7"],
                            configs: { [type]: config }
                        });
                    }
                } else {
                    if (!configuredElements.has(id)) {
                        configuredElements.set(id, {
                            name: config["\u00a7NAME\u00a7"],
                            dataSet: "N/A",
                            configs: {}
                        });
                    }
                    configuredElements.get(id).configs[type] = config;
                }
            });
        };

        addToMap(outliers, "outliers");
        addToMap(consistency, "consistency");
        addToMap(completeness, "completeness");

        // --- Step 1: Collect all referenced metadata IDs grouped by type ---
        const referencedByType = { dataElement: new Set(), predictor: new Set(), indicator: new Set() };
        const allLabelMaps = [OUTLIER_METADATA_LABELS, CONSISTENCY_METADATA_LABELS, COMPLETENESS_METADATA_LABELS];
        configuredElements.forEach(function (entry) {
            Object.values(entry.configs).forEach(function (cfg) {
                allLabelMaps.forEach(function (labelMap) {
                    Object.keys(labelMap).forEach(function (placeholder) {
                        const type = labelMap[placeholder][0];
                        const id = cfg[placeholder];
                        if (id && referencedByType[type]) referencedByType[type].add(id);
                    });
                });
            });
        });

        // --- Step 2: Batch-query each type to find which IDs still exist ---
        const endpointByType = { dataElement: "dataElements", predictor: "predictors", indicator: "indicators" };
        const existingByType = { dataElement: null, predictor: null, indicator: null };
        try {
            for (const type of Object.keys(referencedByType)) {
                const ids = Array.from(referencedByType[type]);
                if (ids.length === 0) continue;
                const endpoint = endpointByType[type];
                const result = await d2Get("/api/" + endpoint + "?filter=id:in:[" + ids.join(",") + "]&fields=id&paging=false");
                existingByType[type] = new Set((result[endpoint] || []).map(function (o) { return o.id; }));
            }
        } catch (metaCheckErr) {
            console.warn("Could not check referenced metadata existence; warnings will be suppressed.", metaCheckErr);
        }

        // --- Step 3: Compute per-card missing metadata ---
        // Only flag an ID as missing if we successfully fetched that type's existence set (non-null)
        const missingByCardId = {};
        configuredElements.forEach(function (entry, cardId) {
            const missing = [];
            Object.values(entry.configs).forEach(function (cfg) {
                allLabelMaps.forEach(function (labelMap) {
                    Object.keys(labelMap).forEach(function (placeholder) {
                        const type = labelMap[placeholder][0];
                        const label = labelMap[placeholder][1];
                        const id = cfg[placeholder];
                        if (id && existingByType[type] !== null && !existingByType[type].has(id)) {
                            missing.push({ type: type, label: label, id: id });
                        }
                    });
                });
            });
            missingByCardId[cardId] = missing;
        });

        if (configuredElements.size === 0) {
            el("configuredOutliers").innerHTML =
                "<div class=\"empty-state\">" +
                "<p>No data elements configured yet.</p>" +
                "<p>Go to the <a href=\"#\" data-tab=\"configure\">Add new</a> tab to get started.</p>" +
                "</div>";

            // Attach click handler for the "Add new" link
            const addNewLink = el("configuredOutliers").querySelector("a[data-tab]");
            if (addNewLink) {
                addNewLink.addEventListener("click", function (e) {
                    e.preventDefault();
                    switchTab("configure");
                });
            }
            return;
        }

        let htmlCode = "<div class=\"config-summary\">" +
            configuredElements.size + " data element" + (configuredElements.size === 1 ? "" : "s") + " configured" +
            "</div>";

        htmlCode += "<div class=\"config-grid\">";

        configuredElements.forEach(function (entry, id) {
            const safeName = escapeHtml(entry.name);
            const safeDataSet = escapeHtml(entry.dataSet);

            htmlCode += "<div class=\"config-card\" data-de-id=\"" + escapeHtml(id) + "\">";

            // Header: name + actions
            const hasOutlier = Boolean(entry.configs.outliers);
            const editBtnHtml = hasOutlier
                ? "<button class=\"dhis2-btn-secondary btn-edit\" data-de-id=\"" + escapeHtml(id) + "\">Edit</button>"
                : "";
            htmlCode += "<div class=\"config-card-header\">" +
                "<div class=\"config-card-title\">" +
                "<h4>" + safeName + "</h4>" +
                "<div class=\"config-card-meta\">" + safeDataSet + "</div>" +
                "</div>" +
                "<div class=\"config-card-actions\">" +
                editBtnHtml +
                "<button class=\"dhis2-btn-destructive btn-delete\" data-de-id=\"" + escapeHtml(id) + "\" data-de-name=\"" + safeName + "\">Remove</button>" +
                "</div>" +
                "</div>";

            // Status chips (one per configured type)
            htmlCode += "<div class=\"config-chips\">";
            Object.keys(entry.configs).forEach(function (type) {
                const details = entry.configs[type];
                let label = type.charAt(0).toUpperCase() + type.slice(1);
                if (type === "outliers" && details["\u00a7VAL_STDDEV\u00a7"]) {
                    label = "Outliers (" + details["\u00a7VAL_STDDEV\u00a7"] + " SD)";
                }
                htmlCode += "<span class=\"dhis2-chip dhis2-chip-active\">" + escapeHtml(label) + "</span>";
            });
            // Warning chip for missing referenced metadata
            const missing = missingByCardId[id] || [];
            const missingChip = missing.length > 0
                ? "<span class=\"dhis2-chip dhis2-chip-warning\" title=\"" +
                    escapeHtml(missing.map(function (m) { return m.type + ": " + m.label + " (" + m.id + ")"; }).join("\n")) +
                    "\">\u26a0 " + missing.length + " missing metadata</span>"
                : "";
            htmlCode += missingChip;
            htmlCode += "</div>";

            // Collapsible details (per config type)
            htmlCode += "<details class=\"config-details\">" +
                "<summary>Show details</summary>";

            Object.keys(entry.configs).forEach(function (type) {
                const details = entry.configs[type];
                let labelMap = null;
                let typeLabel = "";

                if (type === "outliers") {
                    labelMap = OUTLIER_METADATA_LABELS;
                    typeLabel = "Outliers";
                } else if (type === "consistency") {
                    labelMap = CONSISTENCY_METADATA_LABELS;
                    typeLabel = "Consistency";
                } else if (type === "completeness") {
                    labelMap = COMPLETENESS_METADATA_LABELS;
                    typeLabel = "Completeness";
                }

                htmlCode += "<div class=\"config-section\">" +
                    "<h5>" + typeLabel + "</h5>";

                // Settings (parameters)
                htmlCode += "<dl class=\"config-settings\">";
                htmlCode += "<dt>Data element ID</dt><dd><code>" + escapeHtml(id) + "</code></dd>";
                if (details["\u00a7VAL_STDDEV\u00a7"]) {
                    htmlCode += "<dt>Standard deviations</dt><dd>" + escapeHtml(details["\u00a7VAL_STDDEV\u00a7"]) + "</dd>";
                }
                if (details["\u00a7OU_LEVEL\u00a7"]) {
                    const ouLabel = ouLevelMap[details["\u00a7OU_LEVEL\u00a7"]] || details["\u00a7OU_LEVEL\u00a7"];
                    htmlCode += "<dt>Org unit level</dt><dd>" + escapeHtml(ouLabel) + "</dd>";
                }
                if (details["\u00a7NAME_DS\u00a7"]) {
                    htmlCode += "<dt>Data set</dt><dd>" + escapeHtml(details["\u00a7NAME_DS\u00a7"]) + "</dd>";
                }
                htmlCode += "</dl>";

                // Generated metadata items
                if (labelMap) {
                    const items = buildMetadataDetails(details, labelMap);
                    if (items.length > 0) {
                        htmlCode += "<table class=\"dhis2-table config-metadata-table\">" +
                            "<thead><tr><th>Type</th><th>Description</th><th>UID</th></tr></thead><tbody>";
                        items.forEach(function (item) {
                            htmlCode += "<tr>" +
                                "<td>" + escapeHtml(item.type) + "</td>" +
                                "<td>" + escapeHtml(item.label) + "</td>" +
                                "<td><code>" + escapeHtml(item.id) + "</code></td>" +
                                "</tr>";
                        });
                        htmlCode += "</tbody></table>";
                    }
                }

                htmlCode += "</div>";
            });

            htmlCode += "</details>";
            htmlCode += "</div>";
        });

        htmlCode += "</div>";

        el("configuredOutliers").innerHTML = htmlCode;

        // Attach event listeners to dynamically created buttons
        el("configuredOutliers").querySelectorAll(".btn-edit").forEach(function (btn) {
            btn.addEventListener("click", function () {
                const deId = btn.dataset.deId;
                const card = btn.closest(".config-card");
                editOutlierThreshold(deId, card);
            });
        });

        el("configuredOutliers").querySelectorAll(".btn-delete").forEach(function (btn) {
            btn.addEventListener("click", function () {
                const deId = btn.dataset.deId;
                const deName = btn.dataset.deName;
                deleteConfig(deId, deName);
            });
        });

    } catch (error) {
        console.error("Failed to list configurations:", error);
        el("configuredOutliers").innerHTML = "<p class=\"error\">Failed to load configurations: " + error.message + "</p>";
    }
}

async function deleteConfig(deId, deName) {
    // Show confirmation modal and reset checkbox
    el("deleteModalMessage").textContent = "Remove DQ configuration for '" + deName + "'?";
    el("deleteMetadataCheckbox").checked = false;
    showModal("deleteModal");

    return new Promise(function (resolve) {
        const confirmBtn = el("btnConfirmDelete");
        const cancelBtn = el("btnCancelDelete");

        function cleanup() {
            confirmBtn.removeEventListener("click", onConfirm);
            cancelBtn.removeEventListener("click", onCancel);
            hideModal("deleteModal");
        }

        async function onConfirm() {
            cleanup();
            var alsoDeleteMetadata = el("deleteMetadataCheckbox").checked;
            showLoading();
            try {
                // Load all dataStore arrays
                const outliers = await d2Get("/api/dataStore/dqConfig/outliers");
                const consistency = await d2Get("/api/dataStore/dqConfig/consistency");
                const completeness = await d2Get("/api/dataStore/dqConfig/completeness");

                // Find and collect metadata IDs to remove from groups
                const deIdBase = deId.split(".")[0];

                // Process outliers
                const outlierEntry = outliers.find(function (item) {
                    return Object.keys(item)[0] === deId;
                });
                if (outlierEntry) {
                    const config = outlierEntry[deId];
                    // Remove from groups
                    const deIds = [
                        config["\u00a7DE_NOUTLIER_COUNT\u00a7"],
                        config["\u00a7DE_NOUTLIER_VAL\u00a7"],
                        config["\u00a7DE_OUTLIER_COUNT\u00a7"],
                        config["\u00a7DE_OUTLIER_VAL\u00a7"],
                        config["\u00a7DE_THRESHOLD\u00a7"]
                    ].filter(Boolean);
                    const inIds = [
                        config["\u00a7IN_NOUTLIER_PROP\u00a7"],
                        config["\u00a7IN_OUTLIER_PROP\u00a7"]
                    ].filter(Boolean);
                    const pdIds = [
                        config["\u00a7PD_NOUTLIER_COUNT\u00a7"],
                        config["\u00a7PD_NOUTLIER_VAL\u00a7"],
                        config["\u00a7PD_OUTLIER_COUNT\u00a7"],
                        config["\u00a7PD_OUTLIER_VAL\u00a7"],
                        config["\u00a7PD_THRESHOLD\u00a7"]
                    ].filter(Boolean);
                    const thresholdPdIds = [config["\u00a7PD_THRESHOLD\u00a7"]].filter(Boolean);
                    const analysisPdIds = pdIds.filter(function (id) {
                        return !thresholdPdIds.includes(id);
                    });

                    if (deIds.length) await removeFromDeGroup(baseConfig.dataElementGroup, deIds);
                    if (inIds.length) await removeFromInGroup(baseConfig.indicatorGroup, inIds);
                    if (pdIds.length) await removeFromPdGroup(baseConfig.predictorGroup, pdIds);
                    if (thresholdPdIds.length) await removeFromPdGroup(baseConfig.predictorGroupThreshold, thresholdPdIds);
                    if (analysisPdIds.length) await removeFromPdGroup(baseConfig.predictorGroupAnalysis, analysisPdIds);
                }

                // Process consistency
                const consistencyEntry = consistency.find(function (item) {
                    return Object.keys(item)[0] === deId;
                });
                if (consistencyEntry) {
                    const config = consistencyEntry[deId];
                    const deIds = [
                        config["\u00a7DE_CONS_ALL\u00a7"],
                        config["\u00a7DE_CONS_ANY\u00a7"]
                    ].filter(Boolean);
                    const inIds = [config["\u00a7IN_CONS_PROP\u00a7"]].filter(Boolean);
                    const pdIds = [
                        config["\u00a7PD_CONS_ALL\u00a7"],
                        config["\u00a7PD_CONS_ANY\u00a7"]
                    ].filter(Boolean);

                    if (deIds.length) await removeFromDeGroup(baseConfig.dataElementGroup, deIds);
                    if (inIds.length) await removeFromInGroup(baseConfig.indicatorGroup, inIds);
                    if (pdIds.length) await removeFromPdGroup(baseConfig.predictorGroup, pdIds);
                    if (pdIds.length) await removeFromPdGroup(baseConfig.predictorGroupConsistency, pdIds);
                }

                // Process completeness — dual match: listConfig normalizes completeness
                // cards to the bare DE id, so a bare deId passed in here must still
                // match entries whose stored key is an operand id (deId.cocId), and
                // an operand deId must match a bare stored key for the same DE.
                const completenessEntry = completeness.find(function (item) {
                    const key = Object.keys(item)[0];
                    return key === deId || key.split(".")[0] === deIdBase;
                });
                if (completenessEntry) {
                    const key = Object.keys(completenessEntry)[0];
                    const config = completenessEntry[key];
                    const inIds = [
                        config["\u00a7IN_COMPL\u00a7"],
                        config["\u00a7IN_COMPL_ANY\u00a7"]
                    ].filter(Boolean);

                    if (inIds.length) await removeFromInGroup(baseConfig.indicatorGroup, inIds);
                }

                // Remove entries from dataStore arrays
                const newOutliers = outliers.filter(function (item) {
                    return Object.keys(item)[0] !== deId;
                });
                const newConsistency = consistency.filter(function (item) {
                    return Object.keys(item)[0] !== deId;
                });
                const newCompleteness = completeness.filter(function (item) {
                    const key = Object.keys(item)[0];
                    return !(key === deId || key.split(".")[0] === deIdBase);
                });

                await d2PutJson("/api/dataStore/dqConfig/outliers", newOutliers);
                await d2PutJson("/api/dataStore/dqConfig/consistency", newConsistency);
                await d2PutJson("/api/dataStore/dqConfig/completeness", newCompleteness);

                // --- Optional metadata deletion ---
                if (alsoDeleteMetadata) {
                    var candidateSets = buildCandidateSets(
                        outlierEntry, consistencyEntry, completenessEntry,
                        deId
                    );
                    var ownedIds = await fetchOwnedIds(baseConfig);
                    var templateMap = collectTemplateEntries();
                    var perCheckResults = {};
                    var checkTypes = ["outliers", "consistency", "completeness"];

                    for (var cti = 0; cti < checkTypes.length; cti++) {
                        var checkType = checkTypes[cti];
                        if (!candidateSets[checkType]) continue;
                        try {
                            perCheckResults[checkType] = await evaluateCheckForDeletion(
                                candidateSets[checkType], baseConfig, ownedIds, templateMap
                            );
                            perCheckResults[checkType].candidates = candidateSets[checkType];
                        } catch (evalError) {
                            perCheckResults[checkType] = {
                                ok: false,
                                failures: [{ id: "N/A", placeholderKey: "N/A", kind: "N/A", reason: "evaluation error: " + evalError.message }],
                                candidates: candidateSets[checkType]
                            };
                        }
                    }

                    // Real delete per check where ok=true
                    for (var dci = 0; dci < checkTypes.length; dci++) {
                        var dcType = checkTypes[dci];
                        if (!perCheckResults[dcType] || !perCheckResults[dcType].ok) continue;
                        var deletePayload = { dataElements: [], predictors: [], indicators: [] };
                        var dcCandidates = perCheckResults[dcType].candidates;
                        for (var pi = 0; pi < dcCandidates.length; pi++) {
                            var pluralKey = dcCandidates[pi].kind + "s";
                            deletePayload[pluralKey].push({ id: dcCandidates[pi].id });
                        }
                        if (deletePayload.dataElements.length === 0) delete deletePayload.dataElements;
                        if (deletePayload.predictors.length === 0) delete deletePayload.predictors;
                        if (deletePayload.indicators.length === 0) delete deletePayload.indicators;

                        try {
                            await d2PostJson(
                                "/api/metadata?importStrategy=DELETE&atomicMode=ALL",
                                deletePayload
                            );
                            perCheckResults[dcType].deleted = true;
                        } catch (delError) {
                            perCheckResults[dcType].deleted = false;
                            perCheckResults[dcType].deleteError = delError.message;
                        }
                    }

                    // Dev inspection — full per-check detail on the browser console
                    console.log("perCheckResults:", perCheckResults);

                    // Build summary notification
                    var summaryParts = ["Config removed."];
                    var checkLabels = { outliers: "Outlier", consistency: "Consistency", completeness: "Completeness" };
                    var anySkippedOrFailed = false;
                    for (var si = 0; si < checkTypes.length; si++) {
                        var sType = checkTypes[si];
                        var result = perCheckResults[sType];
                        if (!result) continue;
                        if (result.deleted) {
                            summaryParts.push(checkLabels[sType] + " metadata: deleted.");
                        } else if (result.deleteError) {
                            anySkippedOrFailed = true;
                            summaryParts.push(checkLabels[sType] + " metadata: delete failed (" + result.deleteError + ").");
                        } else {
                            anySkippedOrFailed = true;
                            // Skipped — report first failure reason with label if available
                            if (result.failures && result.failures.length > 0) {
                                var firstFail = result.failures[0];
                                var failLabel = labelForPlaceholder(firstFail.placeholderKey);
                                summaryParts.push(checkLabels[sType] + " metadata: skipped (" + failLabel + " '" + firstFail.id + "' " + firstFail.reason + ").");
                            } else {
                                summaryParts.push(checkLabels[sType] + " metadata: skipped.");
                            }
                        }
                    }
                    showNotification(summaryParts.join(" "), anySkippedOrFailed ? "warning" : "success");
                } else {
                    showNotification("Configuration for '" + deName + "' removed successfully.", "success");
                }

                await listConfig();
            } catch (error) {
                showNotification("Failed to remove configuration: " + error.message, "error");
            } finally {
                hideLoading();
            }
            resolve();
        }

        function onCancel() {
            cleanup();
            resolve();
        }

        confirmBtn.addEventListener("click", onConfirm);
        cancelBtn.addEventListener("click", onCancel);
    });
}

async function editOutlierThreshold(deId, cardElement) {
    // Find the outlier config for this data element
    const outliers = await d2Get("/api/dataStore/dqConfig/outliers");
    const entryIndex = outliers.findIndex(function (item) {
        return Object.keys(item)[0] === deId;
    });
    if (entryIndex === -1) {
        showNotification("Outlier configuration not found.", "error");
        return;
    }

    const config = outliers[entryIndex][deId];
    const currentSD = config["\u00a7VAL_STDDEV\u00a7"];

    // Show inline edit form
    let existingForm = cardElement.querySelector(".edit-form");
    if (existingForm) {
        existingForm.remove();
        return; // Toggle off if already showing
    }

    const formHtml = "<div class=\"edit-form\">" +
        "<label class=\"dhis2-label\">New outlier threshold (standard deviations)</label>" +
        "<input class=\"dhis2-input edit-threshold-input\" type=\"number\" min=\"2\" max=\"4\" step=\"0.1\" value=\"" + currentSD + "\">" +
        "<div style=\"margin-top: 8px;\">" +
        "<button class=\"dhis2-btn btn-save-edit\">Save</button> " +
        "<button class=\"dhis2-btn-secondary btn-cancel-edit\">Cancel</button>" +
        "</div>" +
        "<p style=\"margin-top: 8px; font-size: 13px; color: var(--dhis2-text-secondary);\">" +
        "To change data element or org unit level, remove and re-create the configuration.</p>" +
        "</div>";

    cardElement.insertAdjacentHTML("beforeend", formHtml);

    const form = cardElement.querySelector(".edit-form");
    const input = form.querySelector(".edit-threshold-input");

    form.querySelector(".btn-cancel-edit").addEventListener("click", function () {
        form.remove();
    });

    form.querySelector(".btn-save-edit").addEventListener("click", async function () {
        const newSD = input.value;
        if (!newSD || parseFloat(newSD) < 2 || parseFloat(newSD) > 4) {
            showNotification("Threshold must be between 2 and 4.", "warning");
            return;
        }
        if (newSD === currentSD) {
            form.remove();
            return;
        }

        showLoading();
        try {
            const oldSD = currentSD;

            // Helper for targeted string replacement
            function replaceSD(str) {
                return str
                    .split("mean + " + oldSD + " SD").join("mean + " + newSD + " SD")
                    .split(oldSD + " standard deviations").join(newSD + " standard deviations")
                    .split("(" + oldSD + " * stddevPop").join("(" + newSD + " * stddevPop")
                    .split("+ " + oldSD + " SD)").join("+ " + newSD + " SD)");
            }

            // Fetch affected data elements
            const deIds = [config["\u00a7DE_THRESHOLD\u00a7"], config["\u00a7DE_NOUTLIER_VAL\u00a7"]].filter(Boolean);
            if (deIds.length) {
                const deResult = await d2Get("/api/dataElements?filter=id:in:[" + deIds.join(",") + "]&fields=:owner&paging=false");
                const updatedDEs = deResult["dataElements"].map(function (de) {
                    de.name = replaceSD(de.name);
                    de.shortName = replaceSD(de.shortName);
                    de.description = replaceSD(de.description);
                    return de;
                });
                if (updatedDEs.length) {
                    await d2PostJson("/api/metadata", { "dataElements": updatedDEs });
                }
            }

            // Fetch affected predictors
            const pdId = config["\u00a7PD_THRESHOLD\u00a7"];
            if (pdId) {
                const pdResult = await d2Get("/api/predictors?filter=id:eq:" + pdId + "&fields=:owner&paging=false");
                const updatedPDs = pdResult["predictors"].map(function (pd) {
                    pd.name = replaceSD(pd.name);
                    pd.shortName = replaceSD(pd.shortName);
                    pd.description = replaceSD(pd.description || "");
                    if (pd.generator) {
                        pd.generator.expression = replaceSD(pd.generator.expression);
                        pd.generator.description = replaceSD(pd.generator.description || "");
                        if (pd.generator.displayDescription) {
                            pd.generator.displayDescription = replaceSD(pd.generator.displayDescription);
                        }
                    }
                    return pd;
                });
                if (updatedPDs.length) {
                    await d2PostJson("/api/metadata", { "predictors": updatedPDs });
                }
            }

            // Fetch affected indicators
            const inIds = [config["\u00a7IN_NOUTLIER_PROP\u00a7"], config["\u00a7IN_OUTLIER_PROP\u00a7"]].filter(Boolean);
            if (inIds.length) {
                const inResult = await d2Get("/api/indicators?filter=id:in:[" + inIds.join(",") + "]&fields=:owner&paging=false");
                const updatedINs = inResult["indicators"].map(function (ind) {
                    ind.name = replaceSD(ind.name);
                    ind.shortName = replaceSD(ind.shortName);
                    ind.description = replaceSD(ind.description || "");
                    return ind;
                });
                if (updatedINs.length) {
                    await d2PostJson("/api/metadata", { "indicators": updatedINs });
                }
            }

            // Update dataStore config
            config["\u00a7VAL_STDDEV\u00a7"] = newSD;
            outliers[entryIndex] = { [deId]: config };
            await d2PutJson("/api/dataStore/dqConfig/outliers", outliers);

            showNotification("Outlier threshold updated to " + newSD + " SD.", "success");
            await listConfig();
        } catch (error) {
            showNotification("Failed to update threshold: " + error.message, "error");
        } finally {
            hideLoading();
        }
    });
}

// ============================================================
// 10. TAB NAVIGATION
// ============================================================
// (switchTab() is defined in Section 4 UI Helpers above)
// Tab click handler is bound in load() via event delegation.

// ============================================================
// 11. FORM LOGIC
// ============================================================

// One-time form event binding — call only once on initial page load
function bindFormEvents() {
    // Bind filter inputs to their respective selects
    bindSelectFilter("filterDataSet", "selectDataSet");
    bindSelectFilter("filterDataElement", "selectDataElement");
    bindSelectFilter("filterDisaggregation", "selectDisaggregation");
    bindSelectFilter("filterOuLevel", "selectOuLevel");

    el("selectDataSet").addEventListener("change", async function () {
        showLoading();
        try {
            await updateDataElements();
            await makeSelectOuLevel();
            previewPossible();
        } finally {
            hideLoading();
        }
    });

    // Data element change → show/hide disaggregation select
    el("selectDataElement").addEventListener("change", function () {
        updateDisaggregation();
        previewPossible();
    });

    // Disaggregation change → show/hide completeness section
    el("selectDisaggregation").addEventListener("change", function () {
        updateCompletenessVisibility();
        previewPossible();
    });

    // Completeness approach radio handler — proxy reveals the CoC-as-proxy dropdown
    document.querySelectorAll("input[name='completenessApproach']").forEach(function (radio) {
        radio.addEventListener("change", function () {
            const deId = el("selectDataElement").value;
            const meta = deId ? dataElementMetaMap[deId] : null;
            if (meta) {
                populateProxyOperandSelect(deId, meta.cocs);
            }
            previewPossible();
        });
    });
}

// Populate form selects — safe to call multiple times
async function prepInputs() {
    const htmlCode = await makeSelect("dataSets", "?paging=false");
    el("selectDataSet").innerHTML = htmlCode;
    el("selectDataSet").selectedIndex = -1;
    resetSelectFilter("filterDataSet", "selectDataSet");

    // Hide completeness section initially
    el("completenessSection").style.display = "none";
}

// Module-level map of dataElement id → {catComboName, source, cocs[]}
// Populated by updateDataElements(), consumed by updateDisaggregation().
// source is "dataElement" or "dataSet override".
let dataElementMetaMap = {};

async function updateDataElements() {
    try {
        const dataSetId = el("selectDataSet").value;
        dataElementMetaMap = {};

        const dataElementsResponse = await d2Get(
            "/api/dataElements?filter=dataSetElements.dataSet.id:like:" + dataSetId +
            "&filter=valueType:in:[NUMBER,UNIT_INTERVAL,PERCENTAGE,INTEGER,INTEGER_POSITIVE,INTEGER_NEGATIVE,INTEGER_ZERO_OR_POSITIVE]" +
            "&fields=name,id,categoryCombo[id,name,categoryOptionCombos[id,name]]," +
            "dataSetElements[dataSet[id],categoryCombo[id,name,categoryOptionCombos[id,name]]]" +
            "&paging=false"
        );

        const dataElements = [...dataElementsResponse["dataElements"]].sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });

        // Already-configured DEs (disabled in the select)
        const configuredOutliers = await d2Get("/api/dataStore/dqConfig/outliers");
        const configuredElements = new Set(configuredOutliers.flatMap(function (ol) {
            return Object.keys(ol);
        }));

        // Compute effective categoryCombo per DE (dataSet override takes precedence)
        dataElements.forEach(function (de) {
            let effectiveCC = de.categoryCombo;
            let source = "data element";
            if (Array.isArray(de.dataSetElements)) {
                const override = de.dataSetElements.find(function (dse) {
                    return dse && dse.dataSet && dse.dataSet.id === dataSetId && dse.categoryCombo;
                });
                if (override) {
                    effectiveCC = override.categoryCombo;
                    source = "data set override";
                }
            }
            const cocs = (effectiveCC && effectiveCC.categoryOptionCombos) || [];
            dataElementMetaMap[de.id] = {
                catComboName: effectiveCC ? effectiveCC.name : "default",
                source: source,
                cocs: [...cocs].sort(function (a, b) { return a.name.localeCompare(b.name); })
            };
        });

        // Build select HTML — bare data elements only (no "[Select…]" prompt;
        // the label above the select already identifies the field)
        const dataElementHtml = dataElements.map(function (de) {
            const isDisabled = configuredElements.has(de.id);
            return "<option value='" + de.id + "'" +
                (isDisabled ? " disabled" : "") + ">" + escapeHtml(de.name) + "</option>";
        }).join("");

        el("selectDataElement").innerHTML = dataElementHtml;
        el("selectDataElement").selectedIndex = -1;
        resetSelectFilter("filterDataElement", "selectDataElement");
        // Reset downstream selects
        el("selectDisaggregation").innerHTML = "";
        resetSelectFilter("filterDisaggregation", "selectDisaggregation");
        el("disaggregationSection").style.display = "none";
        el("completenessSection").style.display = "none";

    } catch (error) {
        showNotification("Failed to update data elements: " + error.message, "error");
    }
}

// Show/hide and populate the disaggregation select based on the selected DE's effective CC
function updateDisaggregation() {
    const deId = el("selectDataElement").value;
    const meta = deId ? dataElementMetaMap[deId] : null;

    if (!meta || meta.catComboName.toLowerCase() === "default") {
        el("disaggregationSection").style.display = "none";
        el("selectDisaggregation").innerHTML = "";
        resetSelectFilter("filterDisaggregation", "selectDisaggregation");
        el("completenessSection").style.display = "none";
        return;
    }

    // Only annotate when the category combo is overridden by the data set
    const sourceLabel = meta.source === "data set override"
        ? " — from data set override"
        : "";
    const options = [
        "<option value='__total__'>Total (all disaggregations combined)" + escapeHtml(sourceLabel) + "</option>"
    ];
    meta.cocs.forEach(function (coc) {
        options.push("<option value='" + coc.id + "'>" + escapeHtml(coc.name + sourceLabel) + "</option>");
    });

    el("selectDisaggregation").innerHTML = options.join("");
    el("selectDisaggregation").selectedIndex = -1;
    resetSelectFilter("filterDisaggregation", "selectDisaggregation");
    el("disaggregationSection").style.display = "";
    // Completeness section only appears after user picks "__total__" (see updateCompletenessVisibility)
    el("completenessSection").style.display = "none";
}

// Called when disaggregation changes — show completeness section when user picks "__total__"
function updateCompletenessVisibility() {
    const deId = el("selectDataElement").value;
    const disagg = el("selectDisaggregation").value;
    const meta = deId ? dataElementMetaMap[deId] : null;
    const isDisaggregated = meta && meta.catComboName.toLowerCase() !== "default";

    if (isDisaggregated && disagg === "__total__") {
        el("completenessSection").style.display = "";
        // Populate proxy operand dropdown from the current DE's CoCs
        populateProxyOperandSelect(deId, meta.cocs);
    } else {
        el("completenessSection").style.display = "none";
        el("selectDataElementOperand").value = "";
    }
}

function populateProxyOperandSelect(deId, cocs) {
    const showOperand = el("proxyApproach").checked;
    el("selectDataElementOperand").style.display = showOperand ? "" : "none";
    const options = ["<option value=''>[Select disaggregation to use as proxy]</option>"];
    cocs.forEach(function (coc) {
        options.push("<option value='" + deId + "." + coc.id + "'>" + escapeHtml(coc.name) + "</option>");
    });
    el("selectDataElementOperand").innerHTML = options.join("");
}

// Compute the effective data element / operand ID from the current form state
function effectiveDeSourceId() {
    const deId = el("selectDataElement").value;
    if (!deId) return "";
    const disagg = el("selectDisaggregation").value;
    const meta = dataElementMetaMap[deId];
    if (meta && meta.catComboName.toLowerCase() !== "default" && disagg && disagg !== "__total__") {
        return deId + "." + disagg;
    }
    return deId;
}

// ============================================================
// 12. INITIALIZATION
// ============================================================

async function findOrCreateGroup(apiPath, name, shortName, sharing, extraProps) {
    // Check if group with this name already exists
    const searchResult = await d2Get(
        "/api/" + apiPath + "?filter=name:eq:" + encodeURIComponent(name) + "&fields=id&paging=false"
    );
    const existing = searchResult[apiPath];
    if (existing && existing.length > 0) {
        return existing[0]["id"];
    }

    // Create new group
    const uids = await generateUids(1);
    const groupId = uids[0];
    const group = {
        "id": groupId,
        "name": name,
        "sharing": sharing,
        ...extraProps
    };
    if (shortName) group.shortName = shortName;
    await d2PostJson("/api/" + apiPath, group);
    return groupId;
}

async function initialise() {
    showLoading();
    try {
        const newBaseConfig = {};
        const data = await d2Get("/api/me?fields=id");
        const userId = data["id"];

        // Create sharing template
        const makeSharingForGroup = function (groupId) {
            return {
                "public": "r-------",
                "userGroups": {
                    [groupId]: {
                        "access": "rw------",
                        "id": groupId
                    }
                }
            };
        };

        // 1. User Group — check-then-create
        const ugSearch = await d2Get(
            "/api/userGroups?filter=name:eq:" + encodeURIComponent("DQ - DQ Config Admin") + "&fields=id,users[id]&paging=false"
        );
        const existingUGs = ugSearch["userGroups"];
        let ugId;

        if (existingUGs && existingUGs.length > 0) {
            ugId = existingUGs[0]["id"];
            // Add current user if not already a member
            const members = existingUGs[0]["users"] || [];
            const isMember = members.some(function (u) { return u.id === userId; });
            if (!isMember) {
                const group = await d2Get("/api/userGroups/" + ugId + "?fields=:owner");
                group.users.push({ "id": userId });
                await d2PutJson("/api/userGroups/" + ugId, group);
            }
        } else {
            ugId = (await generateUids(1))[0];
            await d2PostJson("/api/userGroups", {
                "id": ugId,
                "name": "DQ - DQ Config Admin",
                "sharing": makeSharingForGroup(ugId),
                "users": [{ "id": userId }]
            });
        }
        newBaseConfig["userGroup"] = ugId;

        const sharing = makeSharingForGroup(ugId);

        // 2. Data Element Group
        newBaseConfig.dataElementGroup = await findOrCreateGroup(
            "dataElementGroups", "DQ - Data quality data elements", "DQ data elements", sharing
        );

        // 3. Indicator Group
        newBaseConfig.indicatorGroup = await findOrCreateGroup(
            "indicatorGroups", "DQ - Data quality indicators", "DQ indicators", sharing
        );

        // 4. Predictor Groups (4x)
        newBaseConfig.predictorGroup = await findOrCreateGroup(
            "predictorGroups", "DQ - Data quality predictors (all)", "DQ predictors", sharing
        );
        newBaseConfig.predictorGroupThreshold = await findOrCreateGroup(
            "predictorGroups", "DQ - Data quality predictors (thresholds)", null, sharing
        );
        newBaseConfig.predictorGroupAnalysis = await findOrCreateGroup(
            "predictorGroups", "DQ - Data quality predictors (analysis)", null, sharing
        );
        newBaseConfig.predictorGroupConsistency = await findOrCreateGroup(
            "predictorGroups", "DQ - Data quality predictors (consistency)", null, sharing
        );

        // Save to dataStore
        await d2PostJson("/api/dataStore/dqConfig/baseConfig", newBaseConfig);
        await d2PostJson("/api/dataStore/dqConfig/outliers", []);
        await d2PostJson("/api/dataStore/dqConfig/consistency", []);
        await d2PostJson("/api/dataStore/dqConfig/completeness", []);

        showNotification("Initialisation complete.", "success");
        hideModal("initialiseModal");
        load();
    } catch (error) {
        showNotification("Initialisation failed: " + error.message, "error");
    } finally {
        hideLoading();
    }
}

async function migrateBaseConfig(config) {
    let changed = false;

    // Bug fix 1c: migrate "predictorGroupTreshold" → "predictorGroupThreshold"
    if (config["predictorGroupTreshold"] && !config["predictorGroupThreshold"]) {
        config["predictorGroupThreshold"] = config["predictorGroupTreshold"];
        delete config["predictorGroupTreshold"];
        changed = true;
    }

    if (changed) {
        await d2PutJson("/api/dataStore/dqConfig/baseConfig", config);
    }

    return config;
}

// ============================================================
// 13. LOAD & EVENT BINDING
// ============================================================

// One-time event binding — call only once on initial page load
function bindEvents() {
    // Tab navigation — event delegation
    el("tabNav").addEventListener("click", function (e) {
        const tab = e.target.closest(".dhis2-tab");
        if (tab && tab.dataset.tab) {
            e.preventDefault();
            switchTab(tab.dataset.tab);
        }
    });

    // Initialisation modal buttons
    el("btnInitialise").addEventListener("click", initialise);
    el("btnCancelInit").addEventListener("click", function () {
        window.location.href = "../..";
    });

    // Import button
    el("buttonImport").addEventListener("click", async function () {
        const outlierConfig = currentImport["outlierConfig"];
        if (!outlierConfig) return;
        if (!confirm("Configure data quality metrics metadata for '" + outlierConfig["\u00a7NAME\u00a7"] + "'?")) {
            return;
        }

        showLoading();
        el("resultSection").style.display = "none";
        // Disable to prevent double-click re-import
        el("buttonImport").disabled = true;

        try {
            const results = [
                ...(await importOutlier()),
                ...(await importConsistency()),
                ...(await importCompleteness())
            ];

            el("resultSection").style.display = "";
            el("resultTableContainer").innerHTML = generateResultsTable(results);

            // Refresh the configuration overview so the new entry is visible
            await listConfig();
        } catch (error) {
            showNotification("Import failed: " + error.message, "error");
        } finally {
            hideLoading();
        }
    });

    // Preview button
    el("buttonPreview").addEventListener("click", previewConfiguration);

    // Close button — dismiss import results and preview
    el("buttonCloseResult").addEventListener("click", function () {
        el("resultSection").style.display = "none";
        el("previewSection").style.display = "none";
    });

    // Form field change handlers for previewPossible validation
    el("selectDataSet").addEventListener("change", previewPossible);
    el("selectDataElement").addEventListener("change", previewPossible);
    el("selectOuLevel").addEventListener("change", previewPossible);
    el("selectThreshold").addEventListener("change", previewPossible);
}

// Load/refresh app state — safe to call multiple times (e.g., after init)
async function load() {
    try {
        const dataStore = await d2Get("/api/dataStore");

        if (dataStore && dataStore.includes("dqConfig")) {
            baseConfig = await d2Get("/api/dataStore/dqConfig/baseConfig");
            baseConfig = await migrateBaseConfig(baseConfig);

            el("buttonPreview").disabled = true;
            listConfig();
        } else {
            showModal("initialiseModal");
        }

        await prepInputs();
    } catch (error) {
        showNotification("Failed to load app: " + error.message, "error");
    }
}

bindEvents();
bindFormEvents();
load();
