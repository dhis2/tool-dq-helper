
export { templateOutlier };

const templateOutlier = () => {
    return {
        "dataElements": [
            {
                "aggregationType": "SUM",
                "description": "Auto-generated from predictor. This data element mirrors the §NAME§ data element (total for all disaggregations), but with values outside the specified outlier threshold (mean + §VAL_STDDEV§ SD) excluded. This allows doing analysis of the significance/impact of outliers.",
                "domainType": "AGGREGATE",
                "id": "§DE_NOUTLIER_VAL§",
                "name": "DQ - §NAME§ excluding outliers",
                "shortName": "§NAME§ excluding outliers",
                "valueType": "INTEGER_ZERO_OR_POSITIVE"
            },
            {
                "aggregationType": "SUM",
                "description": "Auto-generated from predictor. The count of §NAME§ data values reported (total for disaggregations) that are not outliers.",
                "domainType": "AGGREGATE",
                "id": "§DE_NOUTLIER_COUNT§",
                "name": "DQ - §NAME§ non-outlier count",
                "shortName": "§NAME§ non-outlier count",
                "valueType": "INTEGER_ZERO_OR_POSITIVE"
            },
            {
                "aggregationType": "SUM",
                "description": "Auto-generated from predictor. The count of §NAME§ data values reported (total for disaggregations) that are outliers.",
                "domainType": "AGGREGATE",
                "id": "§DE_OUTLIER_COUNT§",
                "name": "DQ - §NAME§ outlier count",
                "shortName": "§NAME§ outlier count",
                "valueType": "INTEGER_ZERO_OR_POSITIVE"
            },
            {
                "aggregationType": "SUM",
                "description": "Auto-generated from predictor. The outlier threshold for §NAME§, defined as mean + §VAL_STDDEV§ standard deviations. Values greater than this are considered outliers, and should be investigated.",
                "domainType": "AGGREGATE",
                "id": "§DE_OUTLIER_VAL§",
                "name": "DQ - §NAME§ outliers",
                "shortName": "§NAME§ outliers",
                "valueType": "INTEGER_ZERO_OR_POSITIVE"
            },
            {
                "aggregationType": "SUM",
                "description": "Auto-generated from predictor. All §NAME§ data values (total for all disaggregations) that are outside the specified outlier threshold (mean + §VAL_STDDEV§ SD). This can be used for flagging potential outliers in dashboards.",
                "domainType": "AGGREGATE",
                "id": "§DE_THRESHOLD§",
                "name": "DQ - §NAME§ outlier threshold (mean + §VAL_STDDEV§ SD)",
                "shortName": "§NAME§ outlier threshold",
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
                "shortName": "§NAME§ excluding outliers (%)"
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
                "shortName": "§NAME§ outliers (%)"
            }
        ],
        "predictors": [
            {
                "annualSampleCount": 0,
                "generator": {
                    "description": "§NAME§ if §NAME§ <= §NAME§ outlier threshold, else 0",
                    "displayDescription": "§NAME§ if §NAME§ <= §NAME§ outlier threshold, else 0",
                    "expression": "if(#{§DE_SOURCE§}<=#{§DE_THRESHOLD§}, #{§DE_SOURCE§}, 0)",
                    "missingValueStrategy": "SKIP_IF_ALL_VALUES_MISSING",
                    "slidingWindow": false,
                    "translations": []
                },
                "id": "§PD_NOUTLIER_VAL§",
                "name": "DQ - §NAME§ excluding outliers",
                "shortName": "§NAME§ excluding outliers",
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
                    "description": "1 if §NAME§ <= §NAME§ outlier threshold, else 0",
                    "displayDescription": "1 if §NAME§ <= §NAME§ outlier threshold, else 0",
                    "expression": "if(#{§DE_SOURCE§}<=#{§DE_THRESHOLD§}, 1, 0)",
                    "missingValueStrategy": "SKIP_IF_ALL_VALUES_MISSING",
                    "slidingWindow": false,
                    "translations": []
                },
                "id": "§PD_NOUTLIER_COUNT§",
                "name": "DQ - §NAME§ non-outlier count",
                "shortName": "§NAME§ non-outlier count",
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
                    "description": "1 if §NAME§ > §NAME§ outlier threshold, else 0",
                    "displayDescription": "1 if §NAME§ > §NAME§ outlier threshold, else 0",
                    "expression": "if(#{§DE_SOURCE§}>#{§DE_THRESHOLD§},1, 0)",
                    "missingValueStrategy": "SKIP_IF_ALL_VALUES_MISSING",
                    "slidingWindow": false,
                    "translations": []
                },
                "id": "§PD_OUTLIER_COUNT§",
                "name": "DQ - §NAME§ outlier count",
                "shortName": "§NAME§ outlier count",
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
                    "description": "§NAME§ if §NAME§ > §NAME§ outlier threshold, else 0",
                    "displayDescription": "§NAME§ if §NAME§ > §NAME§ outlier threshold, else 0",
                    "expression": "if(#{§DE_SOURCE§}>#{§DE_THRESHOLD§}, #{§DE_SOURCE§}, 0)",
                    "missingValueStrategy": "SKIP_IF_ALL_VALUES_MISSING",
                    "slidingWindow": false,
                    "translations": []
                },
                "id": "§PD_OUTLIER_VAL§",
                "name": "DQ - §NAME§ outliers",
                "shortName": "§NAME§ outliers",
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
                "shortName": "§NAME§ outlier threshold",
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