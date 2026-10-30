/**
 * CalibrationPage — full-screen calibration flow:
 * setup → measuring (chirp progress) → results (save / run again), or failed.
 */

import { useCalibration } from '../hooks/useCalibration';
import { ScreenDialog } from '../components/ui/Dialog';
import { FailedStep, MeasuringStep, ResultsStep, SetupStep } from '../components/calibration/CalibrationSteps';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function CalibrationPage({ visible, onClose }: Props) {
  if (!visible) return null;
  return <CalibrationScreen onClose={onClose} />;
}

function CalibrationScreen({ onClose }: { onClose: () => void }) {
  const cal = useCalibration();
  const close = () => { cal.cancel(); onClose(); };

  return (
    <ScreenDialog title="Calibration" label="Audio calibration" onBack={close}>
      <div className="screen-body">
        <div className="screen-content min-h-full">
          {(cal.step === 'idle' || cal.step === 'setup') && <SetupStep onStart={cal.runCalibration} />}
          {cal.step === 'measuring' && <MeasuringStep progress={cal.chirpProgress} />}
          {cal.step === 'results' && (
            <ResultsStep
              offsetMs={cal.offsetMs}
              consistencyMs={cal.consistencyMs}
              quality={cal.quality}
              accepted={cal.accepted}
              onAccept={() => { cal.acceptResult(); onClose(); }}
              onRunAgain={() => { cal.reset(); cal.runCalibration(); }}
            />
          )}
          {cal.step === 'failed' && (
            <FailedStep
              error={cal.error}
              onRetry={() => { cal.reset(); cal.runCalibration(); }}
              onClose={() => { cal.reset(); onClose(); }}
            />
          )}
        </div>
      </div>
    </ScreenDialog>
  );
}
