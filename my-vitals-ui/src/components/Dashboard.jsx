import React from 'react';
import PropTypes from 'prop-types';

/**
 * Dashboard component displaying vital signs and system status
 *
 * @param {Object} props - Component props
 * @param {Object} props.rppgData - Data from useRPPG hook
 */
export default function Dashboard({ rppgData }) {
  const { bpm, quality, lighting, isProcessing, signalStrength, bufferSize, maxBufferSize, reset } =
    rppgData;

  // Helper function to get BPM status color
  const getBpmStatusColor = () => {
    if (!bpm) return 'text-gray-500';
    if (bpm < 60 || bpm > 100) return 'text-yellow-600';
    return 'text-green-600';
  };

  // Helper function to get quality status color
  const getQualityColor = () => {
    if (quality.includes('Good')) return 'text-green-600';
    if (quality.includes('Fair')) return 'text-yellow-600';
    if (quality.includes('Poor') || quality.includes('Weak')) return 'text-red-600';
    return 'text-gray-600';
  };

  // Helper function to get lighting status color
  const getLightingColor = () => {
    if (lighting.includes('Good')) return 'text-green-600';
    if (lighting.includes('Poor')) return 'text-red-600';
    return 'text-gray-600';
  };

  return (
    <div className="space-y-6">
      {/* Heart Rate Display */}
      <div className="bg-white p-6 rounded-xl shadow-lg border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-lg font-medium text-gray-700">Heart Rate</span>
          {isProcessing && (
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          )}
        </div>
        <div className={`text-3xl font-bold ${getBpmStatusColor()}`}>
          {bpm ? `${bpm}` : '—'}
          <span className="text-lg font-normal ml-1">BPM</span>
        </div>
        {bpm && (
          <div className="text-sm text-gray-500 mt-1">
            {bpm < 60 ? 'Below normal range' : bpm > 100 ? 'Above normal range' : 'Normal range'}
          </div>
        )}
      </div>

      {/* Status Indicators */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="font-medium text-gray-700">Signal Quality:</span>
          <span className={`font-medium ${getQualityColor()}`}>{quality}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="font-medium text-gray-700">Lighting:</span>
          <span className={`font-medium ${getLightingColor()}`}>{lighting}</span>
        </div>

        {/* Signal Strength Indicator */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-medium text-gray-700">Signal Strength:</span>
            <span className="text-sm text-gray-600">{Math.round(signalStrength)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                signalStrength < 20
                  ? 'bg-red-500'
                  : signalStrength < 50
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(100, signalStrength)}%` }}
            ></div>
          </div>
        </div>

        {/* Buffer Progress */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-medium text-gray-700">Data Buffer:</span>
            <span className="text-sm text-gray-600">
              {bufferSize}/{maxBufferSize}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${(bufferSize / maxBufferSize) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="pt-4 border-t">
        <button
          onClick={reset}
          className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors duration-200 font-medium"
        >
          Reset Measurement
        </button>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">Instructions:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Keep your face in the video frame</li>
          <li>• Stay still during measurement</li>
          <li>• Ensure good lighting conditions</li>
          <li>• Allow camera permissions</li>
        </ul>
      </div>
    </div>
  );
}

Dashboard.propTypes = {
  rppgData: PropTypes.shape({
    bpm: PropTypes.number,
    quality: PropTypes.string.isRequired,
    lighting: PropTypes.string.isRequired,
    isProcessing: PropTypes.bool.isRequired,
    signalStrength: PropTypes.number.isRequired,
    bufferSize: PropTypes.number.isRequired,
    maxBufferSize: PropTypes.number.isRequired,
    reset: PropTypes.func.isRequired,
  }).isRequired,
};
