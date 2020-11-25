import React, { useContext, useState } from 'react';
import T from 'prop-types';
import styled, { css } from 'styled-components';
import Panel from '../common/panel';
import media, { isLargeViewport } from '../../styles/utils/media-queries';
import ExploreContext from '../../context/explore-context';
import ModalSelect from './modal-select';
import { ModalHeader } from '../common/modal';
import ModalSelectArea from './modal-select-area';

import Button from '../../styles/button/button';
import InfoButton from '../common/info-button';

import { Card } from '../common/card-list';

import QueryForm from './query-form';
import RasterTray from './raster-tray';
import { ZONES_BOUNDARIES_LAYER_ID } from '../common/mb-map/mb-map';
import { Subheading } from '../../styles/type/heading';

import {
  resourceList,
  weightsList,
  lcoeList
} from './panel-data';

const PrimePanel = styled(Panel)`
  ${media.largeUp`
    width: 22rem;
  `}
`;

const RasterTrayWrapper = styled.div`
  display: grid;
  grid-template-columns: min-content 1fr;
  align-items: baseline;
  ${({ show }) => show && css`
    width: 20rem;
  `}

  > .info-button {
    grid-column: 1;
  }
  > ${Subheading} {
    grid-column: 2;
    ${({ show }) => !show && 'display: none;'}

  }

  > .raster-tray {
    grid-column: 1 /span 2;
    ${({ show }) => !show && 'display: none;'}

  }
`;
function ExpMapPrimePanel (props) {
  const { onPanelChange } = props;

  /**
   * Get Explore context values
   */
  const {
    selectedResource,
    selectedArea,
    setSelectedResource,
    showSelectAreaModal,
    setShowSelectAreaModal,
    showSelectResourceModal,
    setShowSelectResourceModal,
    setInputTouched,
    setZonesGenerated,
    tourStep,
    setTourStep,
    gridMode,
    setGridMode,
    gridSize, setGridSize,
    filteredLayerUrl,
    filtersLists,
    map,
    mapLayers, setMapLayers,
    maxZoneScore, setMaxZoneScore
    // maxLCOE, setMaxLCOE
  } = useContext(ExploreContext);

  const [showRasterPanel, setShowRasterPanel] = useState(false);

  return (
    <>
      <PrimePanel
        collapsible
        additionalControls={
          [
            <Button
              key='open-tour-trigger'
              id='open-tour-trigger'
              variation='base-plain'
              useIcon='circle-question'
              title='Open tour'
              hideText
              onClick={() => setTourStep(0)}
              disabled={tourStep >= 0}
            >
              <span>Open Tour</span>
            </Button>,

            <RasterTrayWrapper
              key='toggle-raster-tray'
              show={showRasterPanel}
            >
              <InfoButton
                id='toggle-raster-tray'
                className='info-button'
                variation='base-plain'
                useIcon='iso-stack'
                title='Toggle Raster Tray'
                info={filteredLayerUrl ? null : 'Apply search to load raster layers'}
                width='20rem'
                hideText
                visuallyDisabled={!filteredLayerUrl}
                onClick={() => {
                  if (filteredLayerUrl) { setShowRasterPanel(!showRasterPanel); }
                }}
              >
                <span>Contextual Layers</span>
              </InfoButton>
              <Subheading>Contextual Layers</Subheading>

              <RasterTray
                show={showRasterPanel}
                className='raster-tray'
                layers={mapLayers}
                onLayerKnobChange={(layer, knob) => {
                  // Check if changes are applied to zones layer, which
                  // have conditional paint properties due to filters
                  if (layer.id === ZONES_BOUNDARIES_LAYER_ID) {
                    const paintProperty = map.getPaintProperty(
                      layer.id,
                      'fill-opacity'
                    );
                    paintProperty[2] = knob.value / 100;
                    map.setPaintProperty(
                      layer.id,
                      'fill-opacity',
                      paintProperty
                    );
                  } else {
                    map.setPaintProperty(
                      layer.id,
                      layer.type === 'vector' ? 'fill-opacity' : 'raster-opacity',
                      knob.value / 100
                    );
                  }
                }}
                onVisibilityToggle={(layer, visible) => {
                  if (visible) {
                    if (layer.type === 'raster') {
                      const ml = mapLayers.map(l => {
                        if (l.type === 'raster') {
                          map.setLayoutProperty(l.id, 'visibility', l.id === layer.id ? 'visible' : 'none');
                          l.visible = l.id === layer.id;
                        }
                        return l;
                      });
                      setMapLayers(ml);
                    } else {
                      map.setLayoutProperty(layer.id, 'visibility', 'visible');
                      const ind = mapLayers.findIndex(l => l.id === layer.id);
                      setMapLayers([...mapLayers.slice(0, ind),
                        {
                          ...layer,
                          visible: true
                        },
                        ...mapLayers.slice(ind + 1)
                      ]);
                    }
                  } else {
                    map.setLayoutProperty(layer.id, 'visibility', 'none');
                    const ind = mapLayers.findIndex(l => l.id === layer.id);
                    setMapLayers([...mapLayers.slice(0, ind),
                      {
                        ...layer,
                        visible: false
                      },
                      ...mapLayers.slice(ind + 1)
                    ]);
                  }
                }}
              />
            </RasterTrayWrapper>

          ]
        }
        direction='left'
        onPanelChange={onPanelChange}
        initialState={isLargeViewport()}
        bodyContent={
          filtersLists ? (
            <QueryForm
              area={selectedArea}
              resource={selectedResource}
              weightsList={weightsList}
              lcoeList={lcoeList}
              gridMode={gridMode}
              setGridMode={setGridMode}
              gridSize={gridSize}
              setGridSize={setGridSize}
              maxZoneScore={maxZoneScore}
              setMaxZoneScore={setMaxZoneScore}
              // maxLCOE={maxLCOE}
              // setMaxLCOE={setMaxLCOE}
              onAreaEdit={() => setShowSelectAreaModal(true)}
              onResourceEdit={() => setShowSelectResourceModal(true)}
              onInputTouched={() => {
                setInputTouched(true);
              }}
              onSelectionChange={() => {
                setZonesGenerated(false);
              }}
            />
          ) : (
            <></>
          )
        }
      />
      <ModalSelect
        revealed={showSelectResourceModal && !showSelectAreaModal}
        onOverlayClick={() => {
          if (selectedResource) {
            setShowSelectResourceModal(false);
          }
        }}
        data={resourceList}
        renderHeader={() => (
          <ModalHeader
            id='select-resource-modal-header'
            title='Select Resource'
          />
        )}
        renderCard={(resource) => (
          <Card
            id={`resource-${resource.name}-card`}
            key={resource.name}
            title={resource.name}
            size='large'
            borderlessMedia
            iconPath={resource.iconPath}
            onClick={() => {
              setShowSelectResourceModal(false);
              setSelectedResource(resource.name);
            }}
          />
        )}
        nonScrolling
      />

      <ModalSelectArea />
    </>
  );
}

ExpMapPrimePanel.propTypes = {
  onPanelChange: T.func
};

export default ExpMapPrimePanel;