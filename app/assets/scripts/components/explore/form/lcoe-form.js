import React, { useCallback } from 'react';
import T from 'prop-types';
import {
  FormWrapper,
  FormHeader,
  PanelOption,
  PanelOptionTitle,
  OptionHeadline
} from './form';
import InfoButton from '../../common/info-button';
import FormInput from '../form/form-input';
// import updateArrayIndex from '../../../utils/update-array-index';

function LCOEForm (props) {
  const { lcoe, active } = props;
  return (
    <FormWrapper active={active}>
      <FormHeader>
        <h4>
          Economic Parameters
        </h4>
        <details>
          <summary>
          Set economic parameters to...
          </summary>
          <p>o change economic calculations. Set custom LCOE inputs to affect the economic analysis for each renewable energy technology.</p>
        </details>
      </FormHeader>
      {lcoe.map(([cost, setCost], ind) => {
        const onChange = useCallback(
          (v) => setCost({
            ...cost,
            input: {
              ...cost.input,
              value: v
            }
          })

        );
        return (
          <PanelOption key={cost.name}>
            <OptionHeadline>
              <PanelOptionTitle>{cost.name}</PanelOptionTitle>
              {cost.info &&
              <InfoButton info={cost.info} id={cost.name}>
                Info
              </InfoButton>}
            </OptionHeadline>

            <FormInput
              option={cost}
              onChange={onChange}
            />
          </PanelOption>
        );
      })}
    </FormWrapper>
  );
}

LCOEForm.propTypes = {
  /* eslint-disable react/no-unused-prop-types */
  name: T.string,
  icon: T.string,
  presets: T.object,
  setPreset: T.func,
  lcoe: T.array,
  setLcoe: T.func,
  active: T.bool
};

export default LCOEForm;
