
export { templateCompleteness, templateConsistency, templateOutlier };

const templateCompleteness = () => {
    return {
        "indicators": [    {
            "name": "DQ - §NAME§ data element completeness (%)",
            "shortName": "§NAME§ completeness (%)",
            "description": "§NAME§ data element completeness, defined as 100 x (count of reported values)/(expected reports).",
            "annualized": false,
            "indicatorType": {
                "id": "§IN_TYPE§"
            },
            "numerator": "subExpression(if(isNotNull(#{§DS_SOURCE§}), 1, 0))",
            "numeratorDescription": "§NAME§ count of values",
            "denominator": "R{§DS_SOURCE§.EXPECTED_REPORTS}",
            "denominatorDescription": "§NAME_DS§ - Expected reports",
            "id": "§IN_COMPL"
        }]
    };
};

const templateConsistency = () => {
    return {
        "dataElements": [{
            "name": "DQ - §NAME§ orgunits reported in all the last 12 Months",
            "shortName": "§SHORTNAME§ all last 12 mnths",
            "description": "Auto-generated from predictor. Count of orgunits (facilities) that reported §NAME§ in ALL the 12 months prior to the reporting period.",
            "aggregationType": "SUM",
            "valueType": "INTEGER_ZERO_OR_POSITIVE",
            "domainType": "AGGREGATE",
            "zeroIsSignificant": false,
            "id": "§DE_CONS_ALL§"
        },
        {
            "name": "DQ - §NAME§ orgunits reported in any of the last 12 Months",
            "shortName": "§SHORTNAME§ any last 12 mnths",
            "description": "Auto-generated from predictor. Count of orgunits (facilities) that reported §NAME§ in ANY of the 12 months prior to the reporting period. Used as an alternative measure of 'expected reports' for completeness.",
            "aggregationType": "SUM",
            "valueType": "INTEGER_ZERO_OR_POSITIVE",
            "domainType": "AGGREGATE",
            "zeroIsSignificant": false,
            "id": "§DE_CONS_ANY§"
        }],
        "indicators": [{
            "name": "DQ - §NAME§ facilities consistently reporting last 12 months (%)",
            "shortName": "§SHORTNAME§ reported 12 mnths (%)",
            "description": "The percentage of facilities that reported §NAME§ in all the previous 12 months, out of those facilities that reported §NAME§ in any of the previous 12 months.",
            "annualized": false,
            "decimals": 1,
            "indicatorType": {
                "id": "§IN_TYPE§"
            },
            "numerator": "#{§DE_CONS_ALL§}",
            "numeratorDescription": "Orgunits reported $NAME$ in all the last 12 Months",
            "denominator": "#{§DE_CONS_ANY§}",
            "denominatorDescription": "Orgunits reported $NAME$ in any of the last 12 Months",
            "id": "§IN_CONS_PROP§"
        }],
        "predictors": [{
            "name": "DQ - §NAME§ orgunits reported in all the last 12 Months",
            "shortName": "§SHORTNAME§ all last 12 mnths",
            "description": "Count of orgunits (facilities) that reported §NAME§ in ALL the 12 months prior to the reporting period.",
            "output": {
                "id": "§DE_CONS_ALL§"
            },
            "outputCombo": {
                "id": "§COC_DEFAULT§"
            },
            "generator": {
                "expression": "if(sum(if(isNotNull(#{§DE_SOURCE§}),1,0)) == 12,1,0)",
                "description": "§NAME§ reported in all the previous 12 months",
                "slidingWindow": false,
                "missingValueStrategy": "SKIP_IF_ALL_VALUES_MISSING",
            },
            "periodType": "Monthly",
            "organisationUnitLevels": [
                {
                    "id": "§OU_LEVEL§"
                }
            ],
            "organisationUnitDescendants": "SELECTED",
            "sequentialSampleCount": 12,
            "annualSampleCount": 0,
            "sequentialSkipCount": 0,
            "id": "§PD_CONS_ALL§"
        },
        {
            "name": "DQ - §NAME§ orgunits reported in any of the last 12 Months",
            "shortName": "§SHORTNAME§ any last 12 mnths",
            "description": "Count of orgunits (facilities) that reported §NAME§ in ANY of the 12 months prior to the reporting period. Used as an alternative measure of 'expected reports' for completeness.",
            "output": {
                "id": "§DE_CONS_ANY§"
            },
            "outputCombo": {
                "id": "§COC_DEFAULT§"
            },
            "generator": {
                "expression": "if(isNotNull(#{§DE_SOURCE§}),1,0)",
                "description": "§NAME§ reported in any of the previous 12 months",
                "slidingWindow": false,
                "missingValueStrategy": "SKIP_IF_ALL_VALUES_MISSING",
            },
            "periodType": "Monthly",
            "organisationUnitLevels": [
                {
                    "id": "§OU_LEVEL§"
                }
            ],
            "organisationUnitDescendants": "SELECTED",
            "sequentialSampleCount": 12,
            "annualSampleCount": 0,
            "sequentialSkipCount": 0,
            "id": "§PD_CONS_ANY§"
        }]
    };
};

const templateOutlier = () => {
    return {
        "dataElements": [
            {
                "aggregationType": "SUM",
                "description": "Auto-generated from predictor. This data element mirrors the §NAME§ data element (total for all disaggregations), but with values outside the specified outlier threshold (mean + §VAL_STDDEV§ SD) excluded. This allows doing analysis of the significance/impact of outliers.",
                "domainType": "AGGREGATE",
                "id": "§DE_NOUTLIER_VAL§",
                "name": "DQ - §NAME§ excluding outliers",
                "shortName": "§SHORTNAME§ excl outlier",
                "valueType": "INTEGER_ZERO_OR_POSITIVE"
            },
            {
                "aggregationType": "SUM",
                "description": "Auto-generated from predictor. The count of §NAME§ data values reported (total for disaggregations) that are not outliers.",
                "domainType": "AGGREGATE",
                "id": "§DE_NOUTLIER_COUNT§",
                "name": "DQ - §NAME§ non-outlier count",
                "shortName": "§SHORTNAME§ non-outl count",
                "valueType": "INTEGER_ZERO_OR_POSITIVE"
            },
            {
                "aggregationType": "SUM",
                "description": "Auto-generated from predictor. The count of §NAME§ data values reported (total for disaggregations) that are outliers.",
                "domainType": "AGGREGATE",
                "id": "§DE_OUTLIER_COUNT§",
                "name": "DQ - §NAME§ outlier count",
                "shortName": "§SHORTNAME§ outlier count",
                "valueType": "INTEGER_ZERO_OR_POSITIVE"
            },
            {
                "aggregationType": "SUM",
                "description": "Auto-generated from predictor. The outlier threshold for §NAME§, defined as mean + §VAL_STDDEV§ standard deviations. Values greater than this are considered outliers, and should be investigated.",
                "domainType": "AGGREGATE",
                "id": "§DE_OUTLIER_VAL§",
                "name": "DQ - §NAME§ outliers",
                "shortName": "§SHORTNAME§ outliers",
                "valueType": "INTEGER_ZERO_OR_POSITIVE"
            },
            {
                "aggregationType": "SUM",
                "description": "Auto-generated from predictor. All §NAME§ data values (total for all disaggregations) that are outside the specified outlier threshold (mean + §VAL_STDDEV§ SD). This can be used for flagging potential outliers in dashboards.",
                "domainType": "AGGREGATE",
                "id": "§DE_THRESHOLD§",
                "name": "DQ - §NAME§ outlier threshold (mean + §VAL_STDDEV§ SD)",
                "shortName": "§SHORTNAME§ outl threshold",
                "valueType": "INTEGER_ZERO_OR_POSITIVE"
            }
        ],
        "indicators": [
            {
                "annualized": false,
                "denominator": "#{§DE_SOURCE§}",
                "denominatorDescription": "§NAME§",
                "description": "§NAME§ excluding values that are outliers as a percentage of all §NAME§ numbers. Outliers are defined as values more than §VAL_STDDEV§ standard deviations from the mean. This indicator gives an indication of the significance/impact of outliers for the data element; a value of 100% means that there are no outliers.",
                "id": "§IN_NOUTLIER_PROP§",
                "indicatorType": {
                    "id": "§IN_TYPE§"
                },
                "name": "DQ - §NAME§ excluding outliers (%)",
                "numerator": "#{§DE_NOUTLIER_VAL§}",
                "numeratorDescription": "§NAME§ excluding outliers",
                "shortName": "§SHORTNAME§ excl outl (%)"
            },
            {
                "denominator": "#{§DE_OUTLIER_COUNT§}+#{§DE_NOUTLIER_COUNT§}",
                "denominatorDescription": "§NAME§ outlier count + §NAME§ non-outlier count",
                "description": "The percentage of data values that are outliers, defined as 100 x (count of outliers)/(count of outliers + count of non-outliers)",
                "id": "§IN_OUTLIER_PROP§",
                "indicatorType": {
                    "id": "§IN_TYPE§"
                },
                "name": "DQ - §NAME§ values that are outliers (%)",
                "numerator": "if( isNotNull( #{§DE_OUTLIER_COUNT§}), #{§DE_OUTLIER_COUNT§}, 0)",
                "numeratorDescription": "§NAME§ outlier count",
                "shortName": "§SHORTNAME§ outlier (%)"
            }
        ],
        "predictors": [
            {
                "annualSampleCount": 0,
                "generator": {
                    "description": "§NAME§ if <= outlier threshold, else 0",
                    "displayDescription": "§NAME§ if <= outlier threshold, else 0",
                    "expression": "if(#{§DE_SOURCE§}<=#{§DE_THRESHOLD§}, #{§DE_SOURCE§}, 0)",
                    "missingValueStrategy": "SKIP_IF_ALL_VALUES_MISSING",
                    "slidingWindow": false,
                    "translations": []
                },
                "id": "§PD_NOUTLIER_VAL§",
                "name": "DQ - §NAME§ excluding outliers",
                "shortName": "§SHORTNAME§ excl outliers",
                "organisationUnitLevels": [
                    {
                        "id": "§OU_LEVEL§"
                    }
                ],
                "output": {
                    "id": "§DE_NOUTLIER_VAL§"
                },
                "outputCombo": {
                    "id": "§COC_DEFAULT§"
                },
                "sequentialSkipCount": 0,
                "sequentialSampleCount": 0,
                "periodType": "Monthly",
                "organisationUnitDescendants": "SELECTED"
            },
            {
                "annualSampleCount": 0,
                "generator": {
                    "description": "1 if §NAME§ <= outlier threshold, else 0",
                    "displayDescription": "1 if §NAME§ <= outlier threshold, else 0",
                    "expression": "if(#{§DE_SOURCE§}<=#{§DE_THRESHOLD§}, 1, 0)",
                    "missingValueStrategy": "SKIP_IF_ALL_VALUES_MISSING",
                    "slidingWindow": false,
                    "translations": []
                },
                "id": "§PD_NOUTLIER_COUNT§",
                "name": "DQ - §NAME§ non-outlier count",
                "shortName": "§SHORTNAME§ non-outl count",
                "organisationUnitLevels": [
                    {
                        "id": "§OU_LEVEL§"
                    }
                ],
                "output": {
                    "id": "§DE_NOUTLIER_COUNT§"
                },
                "outputCombo": {
                    "id": "§COC_DEFAULT§"
                },
                "sequentialSkipCount": 0,
                "sequentialSampleCount": 0,
                "periodType": "Monthly",
                "organisationUnitDescendants": "SELECTED"
            },
            {
                "annualSampleCount": 0,
                "generator": {
                    "description": "1 if §NAME§ > outlier threshold, else 0",
                    "displayDescription": "1 if §NAME§ > outlier threshold, else 0",
                    "expression": "if(#{§DE_SOURCE§}>#{§DE_THRESHOLD§},1, 0)",
                    "missingValueStrategy": "SKIP_IF_ALL_VALUES_MISSING",
                    "slidingWindow": false,
                    "translations": []
                },
                "id": "§PD_OUTLIER_COUNT§",
                "name": "DQ - §NAME§ outlier count",
                "shortName": "§SHORTNAME§ outlier count",
                "organisationUnitLevels": [
                    {
                        "id": "§OU_LEVEL§"
                    }
                ],
                "output": {
                    "id": "§DE_OUTLIER_COUNT§"
                },
                "outputCombo": {
                    "id": "§COC_DEFAULT§"
                },
                "sequentialSkipCount": 0,
                "sequentialSampleCount": 0,
                "periodType": "Monthly",
                "organisationUnitDescendants": "SELECTED"
            },
            {
                "annualSampleCount": 0,
                "generator": {
                    "description": "§NAME§ if > outlier threshold, else 0",
                    "displayDescription": "§NAME§ if > outlier threshold, else 0",
                    "expression": "if(#{§DE_SOURCE§}>#{§DE_THRESHOLD§}, #{§DE_SOURCE§}, 0)",
                    "missingValueStrategy": "SKIP_IF_ALL_VALUES_MISSING",
                    "slidingWindow": false,
                    "translations": []
                },
                "id": "§PD_OUTLIER_VAL§",
                "name": "DQ - §NAME§ outliers",
                "shortName": "§SHORTNAME§ outliers",
                "organisationUnitLevels": [
                    {
                        "id": "§OU_LEVEL§"
                    }
                ],
                "output": {
                    "id": "§DE_OUTLIER_VAL§"
                },
                "outputCombo": {
                    "id": "§COC_DEFAULT§"
                },
                "sequentialSkipCount": 0,
                "sequentialSampleCount": 0,
                "periodType": "Monthly",
                "organisationUnitDescendants": "SELECTED"
            },
            {
                "annualSampleCount": 0,
                "generator": {
                    "description": "Mean of §NAME§ + §VAL_STDDEV§ SD",
                    "displayDescription": "Mean of §NAME§ + §VAL_STDDEV§ SD",
                    "expression": "avg(#{§DE_SOURCE§}) + (§VAL_STDDEV§ * stddevPop(#{§DE_SOURCE§}))",
                    "missingValueStrategy": "SKIP_IF_ALL_VALUES_MISSING",
                    "slidingWindow": false,
                    "translations": []
                },
                "id": "§PD_THRESHOLD§",
                "name": "DQ - §NAME§ outlier threshold (mean + §VAL_STDDEV§ SD)",
                "shortName": "§SHORTNAME§ outl threshold",
                "organisationUnitLevels": [
                    {
                        "id": "§OU_LEVEL§"
                    }
                ],
                "output": {
                    "id": "§DE_THRESHOLD§"
                },
                "outputCombo": {
                    "id": "§COC_DEFAULT§"
                },
                "sequentialSkipCount": 0,
                "sequentialSampleCount": 12,
                "periodType": "Monthly",
                "organisationUnitDescendants": "DESCENDANTS"
            }
        ]
    };
};