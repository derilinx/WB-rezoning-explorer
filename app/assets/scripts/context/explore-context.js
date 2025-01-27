import React, { createContext, useEffect, useState, useReducer, useRef } from 'react';
import T from 'prop-types';
import * as topojson from 'topojson-client';
import bbox from '@turf/bbox';
import bboxPolygon from '@turf/bbox-polygon';

import { featureCollection } from '@turf/helpers';
import useQsState from '../utils/qs-state-hook';
import config from '../config';
import areasJson from '../../data/areas.json';
import { initialApiRequestState } from './contexeed';
import { fetchZonesReducer, fetchZones } from './reducers/zones';

import {
  showGlobalLoadingMessage,
  hideGlobalLoading
} from '../components/common/global-loading';

import {
  INPUT_CONSTANTS,
  RESOURCES,
  checkIncluded,
  getMultiplierByUnit,
  resourceList,
  zoneTypesList,
  apiResourceNameMap
} from '../components/explore/panel-data';

// Prepare area dataset
const areasList = areasJson
  .map((a) => {
    if (a.type === 'country') {
      a.id = a.gid;
    }
    // Parse bounds, if a string
    if (a.bounds && typeof a.bounds === 'string') {
      a.bounds = a.bounds.split(',').map((x) => parseFloat(x));
    }
    return a;
  })
  .sort(function (a, b) {
    var nameA = a.name.toUpperCase();
    var nameB = b.name.toUpperCase();
    if (nameA < nameB) {
      return -1;
    }
    if (nameA > nameB) {
      return 1;
    }
    // names must be equal
    return 0;
  });

const {
  GRID_OPTIONS,
  SLIDER,
  BOOL,
  DROPDOWN,
  MULTI,
  DEFAULT_RANGE
} = INPUT_CONSTANTS;
const maskTypes = [BOOL];
const ExploreContext = createContext({});

export function ExploreProvider (props) {
  const areasInitialized = useRef(false);
  const [maxZoneScore, setMaxZoneScore] = useQsState({
    key: 'maxZoneScore',
    default: undefined,
    hydrator: v => {
      const range = v ? v.split(',').map(Number) : null;

      return {
        name: 'Zone Score Range',
        id: 'zone-score-range',
        active: true,
        isRange: true,
        info: 'A sum of scores for multiple criteria normalized from 0 to 1 and weighted by user-defined weights for each zone. 1 is desired whereas 0 is not. The zone score filter excludes zones with scores below the user-defined threshold.',
        input: {
          value: range ? { min: range[0], max: range[1] } : { min: 0, max: 1 },
          type: SLIDER,
          range: [0, 1]
        }
      };
    },
    dehydrator: v => v.active && `${v.input.value.min},${v.input.value.max}`
  });

  const [maxLCOE, setMaxLCOE] = useQsState({
    key: 'maxLCOE',
    default: undefined,
    hydrator: v => {
      const range = v ? v.split(',').map(Number) : null;

      return {
        name: 'LCOE Range',
        id: 'lcoe-range',
        active: range && true,
        isRange: true,
        unit: 'USD/MWh',
        info: 'The LCOE filter excludes zones with LCOE estimates below the user-defined threshold.',
        input: {
          value: range ? { min: range[0], max: range[1] } : null,
          type: SLIDER,
          range: range || DEFAULT_RANGE
        }
      };
    },
    dehydrator: v => v.active && `${v.input.value.min},${v.input.value.max}`
  });

  // Area context
  const [areas, setAreas] = useState(areasList);
  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedAreaId, setSelectedAreaId] = useQsState({
    key: 'areaId',
    default: undefined,
    validator: areasList.map((a) => a.id)
  });

  // Resource context
  const [availableResources, setAvailableResources] = useState(resourceList);
  const [selectedResource, setSelectedResource] = useQsState({
    key: 'resourceId',
    default: undefined,
    validator: (v) => availableResources.map((r) => r.name).includes(v)
  });

  // Zone type context
  const [availableZoneTypes, setAvailableZoneTypes] = useState(zoneTypesList);
  const [selectedZoneType, setSelectedZoneType] = useQsState({
    key: 'zoneId',
    default: undefined,
    validator: (v) => availableZoneTypes.map((r) => r.name).includes(v?.name)
  });

  // Helper function to update resource list for the selected area.
  // Instead of using "selectedArea" from state, the area must be passed as a param
  // to avoid life cycle errors.
  function updateAvailableResources (area) {
    if (!areasInitialized.current) {
      // Wait for eez to be loaded before checking to see that selected resource is acceptable for this country
      return;
    }
    const updatedList = resourceList.filter((r) => {
      // If no area is selected, return all resources
      if (!area) return true;

      if ( !area.available_resources.includes( r.name ) )
        return false;

      // If resource is not offshore, include it
      if (r.name !== RESOURCES.OFFSHORE) return true;

      // Include offshore if area has EEZ defined
      return typeof area.eez !== 'undefined';
    });

    if (!updatedList.find(r => r.name === selectedResource)) {
      // This means offshore was selcted from previous area
      // But is not available for this country
      // default to wind
      setSelectedResource(undefined);
    }

    setAvailableResources(
      updatedList
    );
  }

  const [tourStep, setTourStep] = useState(0);

  const [currentZones, dispatchCurrentZones] = useReducer(
    fetchZonesReducer,
    initialApiRequestState
  );

  const [filteredLayerUrl, setFilteredLayerUrl] = useState(null);
  const [outputLayerUrl, setOutputLayerUrl] = useState(null);

  const [filterString, setFilterString] = useState( "" );

  // Executed on page mount
  useEffect(() => {
    const visited = localStorage.getItem('site-tour');
    if (visited !== null) {
      setTourStep(Number(visited));
    }

    initAreasAndFilters();
  }, []);

  // Load eezs
  const initAreasAndFilters = async () => {
    showGlobalLoadingMessage('Initializing application...');
    // Parse region and country files into area list
    const eez = await fetch('public/zones/eez_v11.topojson').then((e) =>
      e.json()
    );
    const { features: eezFeatures } = topojson.feature(
      eez,
      eez.objects.eez_v11
    );
    const eezCountries = eezFeatures.reduce((accum, z) => {
      const id = z.properties.ISO_TER1;
      accum.set(id, [...(accum.has(id) ? accum.get(id) : []), z]);
      return accum;
    }, new Map());

    const regions = areas.filter(a => a.type === 'region');

    const regionEezRequests = regions.map(async (r) => {
      const regionEez = await fetch(`public/eez-regions/${r.id}.geojson`)
        .then(e => e.json());

      return {
        ...r,
        eez: regionEez.features
      };
    });

    const regionsWithEez = await Promise.all(regionEezRequests);

    // Apply EEZs to areas list
    const areasWithEez = areas.map((a) => {
      if (a.type === 'country') {
        a.eez = eezCountries.get(a.id);
      } else if (a.type === 'region') {
        return regionsWithEez.find(r => r.id === a.id);
      }
      return a;
    });

    setAreas(areasWithEez);
    const currentArea = areasWithEez.find((a) => a.id === selectedAreaId);

    areasInitialized.current = true;
    updateAvailableResources(currentArea);

    hideGlobalLoading();
  };

  // Handle selected area id changes
  useEffect(() => {
    // Clear current zones
    dispatchCurrentZones({ type: 'INVALIDATE_FETCH_ZONES' });

    // Set area object to context
    const area = areas.find((a) => a.id === selectedAreaId);
    setSelectedArea(area);
    updateAvailableResources(area);
  }, [selectedAreaId]);

  // Find selected area based on changes in id
  // Change options based on energy type
  useEffect(() => {
    let nextArea = areas.find((a) => `${a.id}` === `${selectedAreaId}`);

    if (selectedResource === 'Off-Shore Wind' && nextArea) {
      const initBounds = bboxPolygon(nextArea.bounds);
      const eezs = nextArea.eez ? nextArea.eez : [];
      const fc = featureCollection([initBounds, ...eezs]);
      const newBounds = bbox(fc);
      nextArea = {
        ...nextArea,
        bounds: newBounds
      };
    }

    setSelectedArea(nextArea);
    updateAvailableResources(nextArea);
  }, [areas, selectedAreaId, selectedResource]);

  useEffect(() => {
    localStorage.setItem('site-tour', tourStep);
  }, [tourStep]);

  const generateZones = async (filterString, weights, lcoe) => {
    showGlobalLoadingMessage(`Generating zones for ${selectedArea.name}, this may take a few minutes...`);
    fetchZones(
      selectedArea,
      selectedResource,
      selectedZoneType,
      filterString,
      weights,
      lcoe,
      dispatchCurrentZones
    );
  };

  const getLayerFilterString = (filter) => {
    const { id, active, input, isRange } = filter;

    // Bypass inactive filters
    if (!maskTypes.includes(input.type) &&
        (!active || !checkIncluded(filter, selectedResource))) {
      // Skip filters that are NOT mask and are inactive
      return null;
    } else if (maskTypes.includes(input.type) && active) {
      // If this is an 'active' mask filter, we don't need to send to the api. Active here means include these areas
      return null;
    } else if (isRange) {
      if (input.value.min === input.range[0] &&
        input.value.max === input.range[1]) {
        return null;
      }
    }

    // Add accepted filter types to the query
    if (input.type === SLIDER) {
      const {
        value: { min, max }
      } = filter.input;

      // App uses km but api expects values in meters
      const multiplier = getMultiplierByUnit(filter.unit);
      return `${id}=${min * multiplier},${max * multiplier}`;
    } else if (input.type === BOOL) {
      return `${id}=${filter.input.value}`;
    } else if (input.type === MULTI) {
      return input.value.length === input.options.length ? null : `${id}=${input.value.join(',')}`;
    } else if (input.type === DROPDOWN || input.type === MULTI) {
      return `${id}=${filter.input.value.join(',')}`;
    } else {
    // discard non-accepted filter types
      /* eslint-disable-next-line */
      console.error(`Filter ${id} type not supported by api, discarding`);
      return null;
    }
  }

  const updateFilterString = (filterValues) => {
    // Prepare a query string to the API based from filter values
    //
    const filterString = filterValues
      .map((filter) => {
        const { id, active, input, isRange } = filter;

        // Bypass inactive filters
        if (!maskTypes.includes(input.type) &&
            (!active || !checkIncluded(filter, selectedResource))) {
          // Skip filters that are NOT mask and are inactive
          return null;
        } else if (maskTypes.includes(input.type) && active) {
          // If this is an 'active' mask filter, we don't need to send to the api. Active here means include these areas
          return null;
        } else if (isRange) {
          if (input.value.min === input.range[0] &&
            input.value.max === input.range[1]) {
            return null;
          }
        }

        // Add accepted filter types to the query
        if (input.type === SLIDER) {
          const {
            value: { min, max }
          } = filter.input;

          // App uses km but api expects values in meters
          const multiplier = getMultiplierByUnit(filter.unit);
          return `${id}=${min * multiplier},${max * multiplier}`;
        } else if (input.type === BOOL) {
          return `${id}=${filter.input.value}`;
        } else if (input.type === MULTI) {
          return input.value.length === input.options.length ? null : `${id}=${input.value.join(',')}`;
        } else if (input.type === DROPDOWN || input.type === MULTI) {
          return `${id}=${filter.input.value.join(',')}`;
        } else {
        // discard non-accepted filter types
          /* eslint-disable-next-line */
          console.error(`Filter ${id} type not supported by api, discarding`);
          return null;
        }
      })
      .filter((x) => x)
      .join('&');
    
    setFilterString( filterString );
    return filterString;
  }

  const updateFilteredLayer = (filterValues, weights, lcoe) => {

    let filterString = updateFilterString( filterValues );

    // If area of country type, prepare country path string to add to URL
    const countryPath = `${selectedArea.id}/`;

    // if area of country type, prepare resource path string to add to URL
    const resourcePath = `${apiResourceNameMap[selectedResource]}/`;

    // Off-shore mask flag
    const offshoreWindMask = selectedResource === RESOURCES.OFFSHORE ? '&offshore=true' : '';

    // Apply filter querystring to the map
    setFilteredLayerUrl(
      `${config.apiEndpoint}/filter/${countryPath}{z}/{x}/{y}.png?${filterString}${offshoreWindMask}&color=255,0,160,100`
    );

    const lcoeReduction = Object.entries(lcoe).reduce((accum, [key, value]) => `${accum}&${key}=${value}`, '');

    setOutputLayerUrl(
      `${countryPath}${resourcePath}{z}/{x}/{y}.png?${filterString}&${lcoeReduction}${offshoreWindMask}&colormap=viridis`
    );

    generateZones(filterString, weights, lcoe);
  };

  useEffect(() => {
    if (currentZones.isReady()) {
      const zones = currentZones.getData();
      const value = zones.reduce((acc, z) => ({
        min: z.properties.summary.lcoe < acc.min ? z.properties.summary.lcoe : acc.min,
        max: z.properties.summary.lcoe > acc.max ? z.properties.summary.lcoe : acc.max
      }), { min: Infinity, max: 0 });

      setMaxLCOE({
        ...maxLCOE,
        active: true,
        input: {
          ...maxLCOE.input,
          value,
          range: [value.min, value.max]
        }
      });
    } else {
      setMaxLCOE({
        ...maxLCOE,
        active: false
      });
    }
  }, [currentZones]);

  return (
    <>
      <ExploreContext.Provider
        value={{

          areas,

          // output filters
          maxZoneScore,
          setMaxZoneScore,
          maxLCOE,
          setMaxLCOE,

          /* explore context */
          selectedArea,
          selectedAreaId,
          setSelectedAreaId,

          availableResources,
          selectedResource,
          setSelectedResource,

          availableZoneTypes,
          selectedZoneType,
          setSelectedZoneType,

          currentZones,
          generateZones,

          filterString,
          setFilterString,
          updateFilterString,
          getLayerFilterString,

          filteredLayerUrl,
          setFilteredLayerUrl,
          updateFilteredLayer,
          outputLayerUrl,
          tourStep,
          setTourStep
        }}
      >
        {props.children}
      </ExploreContext.Provider>
    </>
  );
}

ExploreProvider.propTypes = {
  children: T.node
};

export default ExploreContext;
