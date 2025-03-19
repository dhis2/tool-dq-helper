"use strict";

//JS
import $, { data } from "jquery"; //eslint-disable-line
import "webpack-jquery-ui";
import "webpack-jquery-ui/css";

import { d2Get, d2PostJson, d2PutJson } from "./js/d2api.js";
import { templateOutlier, templateConsistency, templateCompleteness } from "./js/templates.js";

//CSS
import "./css/style.css";

var baseConfig;
var currentImport = {};


// REPORTING CONSISTENCY METADATA CONFIGURATION

//Configure metadata for outlier analysis
async function configureConsistencyMetadata(deSource) {

    let consistencyConfig = {
        "§NAME§": deSource.name,
        "§SHORTNAME§": deSource.shortName.length > 28 ? deSource.shortName.substring(0, 28) : deSource.shortName,
        "§DE_SOURCE§": deSource.id,
        "§IN_TYPE§": await indicatorTypePercentId(),
        "§COC_DEFAULT§": await defaultCoCId(),
        "§OU_LEVEL§": $("#selectOuLevel").find(":selected").val(),
        "§DE_CONS_ALL§": false,
        "§DE_CONS_ANY§": false,
        "§IN_CONS_PROP§": false,
        "§PD_CONS_ALL§": false,
        "§PD_CONS_ANY§": false
    };

    var uids = await generateUids(6);

    //Load template outlier metadata as string, so do search/replace of properties
    var templateText = JSON.stringify(templateConsistency());

    for (var prop in consistencyConfig) {
        if (!consistencyConfig[prop]) consistencyConfig[prop] = uids.pop();
        var search = new RegExp(prop, "g");
        var replace = consistencyConfig[prop];
        templateText = templateText.replace(search, replace);
    }

    var consistencyImport = JSON.parse(templateText);

    //Apply sharing
    shareMetadata(consistencyImport, baseConfig["userGroup"]);

    currentImport = {
        ...currentImport,
        "consistencyImport": consistencyImport,
        "consistencyConfig": consistencyConfig
    };

    return consistencyImport;
}

// DATA ELEMENT COMPLETENESS METADATA CONFIGURATION

//Configure metadata for completeness analysis
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
    

    var uids = await generateUids(6);

    //Load template completeness metadata as string, so do search/replace of properties
    var templateText = JSON.stringify(templateCompleteness());

    for (var prop in completenessConfig) {
        if (!completenessConfig[prop]) completenessConfig[prop] = uids.pop();
        var search = new RegExp(prop, "g");
        var replace = completenessConfig[prop];
        templateText = templateText.replace(search, replace);
    }

    var completenessImport = JSON.parse(templateText);

    //Apply sharing
    shareMetadata(completenessImport, baseConfig["userGroup"]);

    currentImport = {
        ...currentImport,
        "completenessImport": completenessImport,
        "completenessConfig": completenessConfig
    };

    return completenessImport;
}

// OUTLIER METADATA CONFIGURATION

//Configure metadata for outlier analysis
async function configureOutlierMetadata(deSource) {

    let outlierConfig = {
        "§NAME§": deSource.name,
        "§SHORTNAME§": deSource.shortName.length > 34 ? deSource.shortName.substring(0, 35) : deSource.shortName,
        "§DE_SOURCE§": deSource.id,
        "§COC_DEFAULT§": await defaultCoCId(),
        "§IN_TYPE§": await indicatorTypePercentId(),
        "§OU_LEVEL§": $("#selectOuLevel").find(":selected").val(),
        "§VAL_STDDEV§": $("#selectThreshold").val(),
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

    var uids = await generateUids(12);

    //Load template outlier metadata as string, so do search/replace of properties
    var templateOutlierText = JSON.stringify(templateOutlier());

    for (var prop in outlierConfig) {
        if (!outlierConfig[prop]) outlierConfig[prop] = uids.pop();
        var search = new RegExp(prop, "g");
        var replace = outlierConfig[prop];
        templateOutlierText = templateOutlierText.replace(search, replace);
    }

    var outlierImport = JSON.parse(templateOutlierText);

    //Apply sharing
    shareMetadata(outlierImport, baseConfig["userGroup"]);

    currentImport = {
        ...currentImport,
        "outlierImport": outlierImport,
        "outlierConfig": outlierConfig
    };

    return outlierImport;
}

/** Split outlier predictors into threshold and analysis predictors, since these must 
 * be run as separate consequtive jobs.
 */
function splitOutlierPredictors(outlierConfig, predictors) {
    let result = {
        "treshold": [],
        "analysis": []
    };
    for (var p of predictors) {
        if (outlierConfig["§PD_THRESHOLD§"] == p["id"]) result.treshold.push(p);
        else result.analysis.push(p);
    }
    return result;

}


// METADATA GROUP MANAGEMENT

//Add data elements to specified group
async function addToDeGroup(groupId, dataElements) {
    let group = await d2Get("/api/dataElementGroups/" + groupId + "?fields=:owner");
    for (var de of dataElements) {
        group.dataElements.push({ "id": de.id});
    }
    return await d2PutJson("/api/dataElementGroups/" + groupId, group);
}

//Add indicators to specified group
async function addToInGroup(groupId, indicators) {
    let group = await d2Get("/api/indicatorGroups/" + groupId + "?fields=:owner");
    for (var de of indicators) {
        group.indicators.push({ "id": de.id});
    }
    return await d2PutJson("/api/indicatorGroups/" + groupId, group);
}

//Add predictors to specified group
async function addToPdGroup(groupId, predictors) {
    let group = await d2Get("/api/predictorGroups/" + groupId + "?fields=:owner");
    for (var de of predictors) {
        group.predictors.push({ "id": de.id});
    }
    return await d2PutJson("/api/predictorGroups/" + groupId, group);
}


// UTILITY FUNCTIONS

//Get the default CoC id
async function defaultCoCId() {
    var data = await d2Get("/api/categoryOptionCombos?filter=name:eq:default&fields=id");
    var defaultId, cocs = data["categoryOptionCombos"];
    if (cocs.length > 1) {
        defaultId = cocs[0]["id"];
        alert("Duplicate default categoryOptionCombos found - this should be fixed. Using " + defaultId);
    }
    else {
        defaultId = cocs[0]["id"];
    }

    return defaultId;
}


/**
 * Asynchronous function to get the ID of the percentage indicator type from the D2 platform API response.
 * This function uses the d2Get method to make an API call with specific filter conditions.
 * @async
 * @returns {Promise<number>} The ID of the percentage indicator type.
 */
async function indicatorTypePercentId() {
    // Fetch data from the D2 platform API with specific filter conditions
    const data = await d2Get("/api/indicatorTypes.json?fields=id&filter=factor:eq:100&filter=number:eq:false");

    // Assign received data to a constant named 'data' and extract 'indicatorTypes' array from it
    const inTypes = data["indicatorTypes"];
    let inTypePercId;

    // Check if there is more than one percentage indicator type in the response, if yes then alert an error message and use the first ID, otherwise use the only available ID
    if (inTypes.length > 1) {
        alert("Duplicate percentage indicator types found - this should be fixed."); // Display an alert message
        inTypePercId = inTypes[0]["id"]; // Use the first ID from the array
    } else {
        inTypePercId = inTypes[0]["id"]; // Directly use the only available ID from the array
    }

    // Return the ID of the percentage indicator type
    return inTypePercId;
}


/**
 * Generates UIDs from the D2 API.
 *
 * @param {number} count - The number of UIDs to generate. Defaults to 1 if not specified.
 *
 * @returns {Promise<string[]>} A promise that resolves to an array of generated UIDs.
 */
// This function generates a specified number of unique identifiers (UIDs) in the form of 
// a string array and returns them to the user. If no count is specified, it defaults to 1.
async function generateUids(count) {
    // First check if a count was passed into the function
    if (!count) count = 1;

    // Get IDs from the API
    var data = await d2Get("/api/system/id?limit=" + count);
    
    return data["codes"];
}


function hasObject(list, prop, val) {
    for (var item of list) {
        if (item[prop] == val) return true;
    }
    return false;

}

//Apply sharing settings to all content of a metadata object
function shareMetadata(metadata, groupId) {
    for (var type in metadata) {
        for (var elem of metadata[type]) {
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


// UI FUNCTIONS

/**
 * Makes an optionSet with DHIS2 objects based on a filter.
 * @param {string} objectName - The name of the DHIS2 object to fetch from the API.
 * @param {string} [filterString] - An optional string containing a filter to add to the API request.
 * @returns {string} A string representing an HTML select element populated with options based on the fetched objects.
 */
async function makeSelect(objectName, filterString) {
    // Create an API string to fetch data from DHIS2 API. The filter is added as a parameter at the end of the string if it exists.
    var apiString = "/api/" + objectName;
    if (filterString) apiString += filterString;

    // Fetch data from the API using d2Get() and store it in result variable.
    let result = await d2Get(apiString);

    // Create a string to hold the options for the select element, starting with a default option.
    var html = "<option value=''>[Select " + objectName + "]</option>";
    
    // Loop through each object in result and create an option element with its display name and ID as the value.
    for (var obj of result[objectName]) {
        html += "<option value='" + obj.id + "'>" + obj.displayName + "</option>";
    }

    // Return the complete select element as a string.
    return html;
}

/**
 * Function to create an HTML table from an array of objects and specific properties.
 * @param {Array<Object>} objects - An array of objects from which table rows will be generated.
 * @param {Array<String>} properties - An array of strings, each representing a property key in the objects.
 * @returns {String} An HTML string that represents an table with the given objects and properties.
 */
function makeTable(objects, properties) {
    // Initialize the HTML code for the table
    var htmlCode = "<table class='generalTable' style='border-collapse: collapse'><tr>";

    // Loop through each property and add a header cell for it
    for (var prop of properties) {
        htmlCode += "<th>" + prop + "</th>";
    }

    // Add a new row for each object
    for (var obj of objects) {
        htmlCode += "</tr><tr>";

        // Loop through each property and add a cell for its corresponding value in the object
        for (prop of properties) {
            
            // Nested variable to hold a copy of the current object without referencing the original
            var nestedObj = JSON.parse(JSON.stringify(obj));

            // Extract the property key from the string by removing the indexes in square brackets
            var parts = prop.split("[");
            for (var part of parts) {
                part = part.replace("]", "");
                nestedObj = nestedObj[part];
            }

            htmlCode += "<td>" + nestedObj + "</td>";
        }
    }

    // Close the last table row and table tag
    htmlCode += "</tr></table>";

    // Return the generated HTML code
    return htmlCode;
}

function generateResultsTable(results) {
    var htmlCode = "<table id='resultTable' class='generalTable'><tr><th>Import</th><th>Status</th></tr>";
    for (var row of results) {
        htmlCode += "<tr><td>" + row[0] + "</td><td>" + row[1] + "</td></tr>";
    }
    htmlCode += "</table>";
    return htmlCode;
}

async function makeSelectOuLevel() {
    var dataSetId = $("#selectDataSet").find(":selected").val();
    
    var data = await d2Get("/api/dataSets/" + dataSetId + "?fields=organisationUnits[level]");
    var orgunits = data["organisationUnits"];
    var levels = {};
    for (var ou of orgunits) {
        if (ou.level > 1) levels[ou.level] = true;
    }
    
    var sortedLevels = Object.keys(levels).map(Number).sort((a, b) => a - b);
    var htmlCode = await makeSelect("organisationUnitLevels", "?filter=level:in:[" + sortedLevels.join(",") + "]");
    $("#selectOuLevel").html(htmlCode);
}

//Returns true if required selection for preview is possible, otherwise false
function previewPossible() {
    var dsId = $("#selectDataSet").find(":selected").val();
    var deId = $("#selectDataElement").find(":selected").val();
    var ouLvl = $("#selectOuLevel").find(":selected").val();
    var threshold = $("#selectThreshold").val();

    if (dsId && dsId.length == 11 && deId && deId.length > 10 && ouLvl && ouLvl.length > 10 && threshold && parseFloat(threshold) > 0 && parseFloat(threshold) < 10) {
        $("#buttonPreview").prop("disabled", false);
    }
    else {
        $("#buttonPreview").prop("disabled", true);
    }
}

async function listConfig() {
    let outliers = await d2Get("/api/dataStore/dqConfig/outliers");
    var htmlCode = "";
    for (var ol of outliers) {
        for (var id in ol) {
            htmlCode += "<h3>" + ol[id]["§NAME§"] + "</h3>";
            htmlCode += "<pre><code>" + JSON.stringify(ol[id], undefined, 2) + "</code></pre>";
        }
    }
    $("#configuredOutliers").html(htmlCode);
}

//Make select boxes for data set, data element, orgunit level, stdDev
async function prepOutlierInputs() {
    var htmlCode = await makeSelect("dataSets", "?paging=false");
    $("#selectDataSet").html(htmlCode);
    $("#selectDataSet").on("change", updateDataElements);
    $("#selectDataSet").on("change", makeSelectOuLevel);

    return false;
}

async function updateDataElements() {
    try {
        const dataSetId = $("#selectDataSet").val();
        
        const dataElementsResponse = await d2Get(`/api/dataElements?filter=dataSetElements.dataSet.id:like:${dataSetId}&filter=valueType:in:[NUMBER,UNIT_INTERVAL,PERCENTAGE,INTEGER,INTEGER_POSITIVE,INTEGER_NEGATIVE,INTEGER_ZERO_OR_POSITIVE]&fields=name,id&paging=false`);
        const dataElements = [...dataElementsResponse["dataElements"]].sort((a, b) => b.name.localeCompare(a.name));

        const dataElementIds = dataElements.map(obj => obj.id);
        const combinedItemsResponse = await d2Get(`/api/dataElementOperands?filter=dataElement.id:in:[${dataElementIds.join(",")}]&filter=id:like:.&fields=name,id&paging=false`);
        const combinedItems = [...combinedItemsResponse["dataElementOperands"]].sort((a, b) => b.name.localeCompare(a.name));
        
        dataElements.forEach(de => {
            if (!hasObject(combinedItems, "id", de.id)) {
                de.name += " (total)";
                combinedItems.unshift(de);
            }
        });

        const outliersResponse = await d2Get("/api/dataStore/dqConfig/outliers");
        const outlierIds = outliersResponse.reduce((ids, ol) => ids.concat(Object.keys(ol)), []);

        const dataElementHtml = ["<option value=''>[Select data element]</option>"].concat(
            combinedItems.map(obj => 
                `<option value='${obj.id}' id='${obj.id}' ${outlierIds.includes(obj.id) ? "disabled" : ""}>${obj.name}</option>`
            )
        ).join("");

        $("#selectDataElement").html(dataElementHtml);
    } catch (error) {
        alert(`Failed to update data elements: ${error.message}`);
    }
}

window.previewConfiguration = async function () {
    $("#resultSection").hide();
    $("#previewSection").hide();

    currentImport = {};

    var deSourceId = $("#selectDataElement").find(":selected").val();
    var dsSourceId = $("#selectDataSet").val();

    var dataElement = await d2Get("/api/dataElements/" + deSourceId + "?fields=name,shortName,id");
    var dataSet = await d2Get("/api/dataSets/" + dsSourceId + "?fields=name,shortName,id,periodType");
    if (dataSet.periodType != "Monthly") {
        alert("Only monthly data sets are automatically supported, configuration of this dataset be updated manually.");
    }

    // Outlier
    let outlierMetadata = await configureOutlierMetadata(dataElement);
    $("#dataElementPreviewOutlier").html(makeTable(outlierMetadata["dataElements"], ["name", "shortName", "description"]));
    $("#predictorPreviewOutlier").html(makeTable(outlierMetadata["predictors"], ["name", "shortName", "generator[expression]"]));
    $("#indicatorPreviewOutlier").html(makeTable(outlierMetadata["indicators"], ["name", "numeratorDescription", "numerator", "denominatorDescription", "denominator"]));

    // Consistency
    let consistencyMetadata = await configureConsistencyMetadata(dataElement);
    $("#dataElementPreviewConsistency").html(makeTable(consistencyMetadata["dataElements"], ["name", "shortName", "description"]));
    $("#predictorPreviewConsistency").html(makeTable(consistencyMetadata["predictors"], ["name", "shortName", "generator[expression]"]));
    $("#indicatorPreviewConsistency").html(makeTable(consistencyMetadata["indicators"], ["name", "numeratorDescription", "numerator", "denominatorDescription", "denominator"]));

    // Completeness
    let completenessMetadata = await configureCompletenessMetadata(dataElement, dataSet);
    $("#indicatorPreviewCompleteness").html(makeTable(completenessMetadata["indicators"], ["name", "numeratorDescription", "numerator", "denominatorDescription", "denominator"]));


    $("#previewSection").show();
    $("#buttonImport").attr("disabled", false);

};

window.importMetadata = async function () {
    $("#resultSection").hide();

    var outlierConfig = currentImport["outlierConfig"];

    if (!confirm("Configure data quality metrics metadata for '" + [outlierConfig["§NAME§"]] + "'?")) {
        return;
    }

    var results = [
        ...(await importOutlier()),
        ...(await importConsistency()),
        ...(await importCompleteness())
    ];

    $("#resultSection").show();
    var resultTable = generateResultsTable(results);
    $("#resultTableContainer").html(resultTable);
};

async function importOutlier() {
    var outlierConfig = currentImport["outlierConfig"];
    var outlierImport = currentImport["outlierImport"];

    var importResult, addGroups = false, results = [];
    
    //Import metadata
    try {
        importResult = await d2PostJson("/api/metadata", outlierImport);    
        results.push(["Outlier - Metadata import", importResult["status"]]);
        addGroups = true;
    } catch (error) {
        results.push(["Outlier - Metadata import", error["status"]]);
    }
    
    
    if (addGroups) {
        try {
            //Add objects to groups
            importResult = await addToDeGroup(baseConfig.dataElementGroup, outlierImport.dataElements);
            results.push(["Outlier - Add to data element group", importResult["status"]]);
            importResult = await addToInGroup(baseConfig.indicatorGroup, outlierImport.indicators);
            results.push(["Outlier - Add to indicator group", importResult["status"]]);
            importResult = await addToPdGroup(baseConfig.predictorGroup, outlierImport.predictors);
            results.push(["Outlier - Add to general predictor group", importResult["status"]]);
            importResult = await addToPdGroup(baseConfig.predictorGroupTreshold, splitOutlierPredictors(outlierConfig, outlierImport.predictors)["treshold"]);
            results.push(["Outlier - Add to treshold predictor group", importResult["status"]]);
            importResult = await addToPdGroup(baseConfig.predictorGroupAnalysis, splitOutlierPredictors(outlierConfig, outlierImport.predictors)["analysis"]);
            results.push(["Outlier - Add to analysis predictor group", importResult["status"]]);
        }
        catch (error) {
            results.push("Outlier - Add to groups", error["status"]);
        }
        try {
            //Add config to dataStore
            let outlierStore = await d2Get("/api/dataStore/dqConfig/outliers");
            outlierStore.push( {
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
    var consistencyConfig = currentImport["consistencyConfig"];
    var consistencyImport = currentImport["consistencyImport"];

    var importResult, addGroups = false, results = [];
    
    //Import metadata
    try {
        importResult = await d2PostJson("/api/metadata", consistencyImport);    
        results.push(["Consistency - Metadata import", importResult["status"]]);
        addGroups = true;
    } catch (error) {
        results.push(["Consistency - Metadata import", error["status"]]);
    }
    
    
    if (addGroups) {
        try {
            //Add objects to groups
            importResult = await addToDeGroup(baseConfig.dataElementGroup, consistencyImport.dataElements);
            results.push(["Consistency - Add to data element group", importResult["status"]]);
            importResult = await addToInGroup(baseConfig.indicatorGroup, consistencyImport.indicators);
            results.push(["Consistency - Add to indicator group", importResult["status"]]);
            importResult = await addToPdGroup(baseConfig.predictorGroup, consistencyImport.predictors);
            results.push(["Consistency - Add to general predictor group", importResult["status"]]);
            importResult = await addToPdGroup(baseConfig.predictorGroupConsistency, consistencyImport.predictors);
            results.push(["Consistency - Add to treshold predictor group", importResult["status"]]);
        }
        catch (error) {
            results.push(["Consistency - Add to groups", error["status"]]);
        }
        try {
            //Add config to dataStore
            let consistencyStore = await d2Get("/api/dataStore/dqConfig/consistency");
            consistencyStore.push( {
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
    var completenessConfig = currentImport["completenessConfig"];
    var completenessImport = currentImport["completenessImport"];

    var importResult, addGroups = false, results = [];
    
    //Import metadata
    try {
        importResult = await d2PostJson("/api/metadata", completenessImport);
        console.log(importResult);
        results.push(["Completeness - Metadata import", importResult["status"]]);
        addGroups = true;
    } catch (error) {
        results.push(["Completeness - Metadata import", "Error " + error["status"]]);
    }
    
    
    if (addGroups) {
        try {
            //Add objects to groups
            importResult = await addToInGroup(baseConfig.indicatorGroup, completenessImport.indicators);
            results.push(["Completeness - Add to indicator group", importResult["status"]]);
        }
        catch (error) {
            results.push(["Completeness - Add to groups", error["status"]]);
        }
        try {
            //Add config to dataStore
            let completenessStore = await d2Get("/api/dataStore/dqConfig/completeness");
            completenessStore.push( {
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


window.closeApp = function() {
    window.location.href = "../..";
};



// INITIALISATION

window.initialise = async function () {

    var baseConfig = {};

    //get some UIDs
    var uids = await generateUids(10);

    //get current user ID
    var data = await d2Get("/api/me?fields=id");
    var userId = data["id"];

    //create UG with current user
    var groupId = uids.pop();
    var userGroup = {
        "id": groupId,
        "name": "DQ - DQ Config Admin",
        "sharing": {
            "public": "r-------",
            "userGroups": {
                [groupId]: {
                    "access": "rw------",
                    "id": groupId
                }
            }
        },
        "users": [
            { "id": userId }
        ]
    };
    await d2PostJson("/api/userGroups", userGroup);
    baseConfig["userGroup"] = groupId;

    //import DQ admin groups owned by DQ admin group
    var group = {
        "sharing": {
            "public": "r-------",
            "userGroups": {
                [groupId]: {
                    "access": "rw------",
                    "id": groupId
                }
            }
        }
    };

    group.name = "DQ - Data quality data elements";
    group.shortName = "DQ data elements";
    group.id = uids.pop();
    baseConfig.dataElementGroup = group.id;
    await d2PostJson("/api/dataElementGroups", group);

    group.name = "DQ - Data quality indicators";
    group.shortName = "DQ indicators";
    group.id = uids.pop();
    baseConfig.indicatorGroup = group.id;
    await d2PostJson("/api/indicatorGroups", group);

    group.name = "DQ - Data quality predictors (all)";
    group.shortName = "DQ predictors";
    group.id = uids.pop();
    baseConfig.predictorGroup = group.id;
    await d2PostJson("/api/predictorGroups", group);

    group.name = "DQ - Data quality predictors (thresholds)";
    group.id = uids.pop();
    baseConfig.predictorGroupTreshold = group.id;
    await d2PostJson("/api/predictorGroups", group);

    group.name = "DQ - Data quality predictors (analysis)";
    group.id = uids.pop();
    baseConfig.predictorGroupAnalysis = group.id;
    await d2PostJson("/api/predictorGroups", group);

    group.name = "DQ - Data quality predictors (consistency)";
    group.id = uids.pop();
    baseConfig.predictorGroupConsistency = group.id;
    await d2PostJson("/api/predictorGroups", group);

    //make dqConfig dataStore entry with baseline info
    await d2PostJson("/api/dataStore/dqConfig/baseConfig", baseConfig);
    await d2PostJson("/api/dataStore/dqConfig/outliers", []);
    await d2PostJson("/api/dataStore/dqConfig/consistency", []);
    await d2PostJson("/api/dataStore/dqConfig/completeness", []);

    load();
};


//Check if basic config exist - DQ UG, datastore, metadata groups
async function load() {
    $("#tabs").tabs();

    var dataStore = await d2Get("/api/dataStore");

    if (dataStore && dataStore.includes("dqConfig")) {
        baseConfig = await d2Get("/api/dataStore/dqConfig/baseConfig");

        $("#buttonPreview").attr("disabled", true);

        listConfig();
    } else {
        $("#initialiseModal").show();
    }

    await prepOutlierInputs();
    $("#selectDataSet, #selectDataElement, #selectOuLevel, #selectThreshold").on("change", previewPossible);
}

load();

