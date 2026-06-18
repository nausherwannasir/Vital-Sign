import React from 'react';
import VideoFeed from './components/VideoFeed';
import Dashboard from './components/Dashboard';
import useRPPG from './hooks/useRPPG';
import { motion } from 'framer-motion';
import { HeartIcon } from '@heroicons/react/24/solid';

/**
 * Main App component for the Heart Rate Monitor
 *
 * Integrates video processing with rPPG analysis to provide real-time
 * contactless heart rate monitoring through webcam video.
 */
export default function App() {
  // Initialize rPPG hook for heart rate processing
  const rppgData = useRPPG();

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Video Feed Section */}
      <div className="lg:w-2/3 flex justify-center items-center p-6">
        <div className="w-full max-w-3xl">
          <VideoFeed
            className="shadow-2xl rounded-2xl overflow-hidden border-4 border-white"
            onFrameData={rppgData.processFrame}
          />

          {/* Quick Status Indicators */}
          <div className="mt-4 flex justify-center space-x-4">
            <div className="bg-white/80 backdrop-blur-sm px-3 py-2 rounded-lg shadow-md">
              <span className="text-sm font-medium text-gray-700">
                Buffer: {rppgData.bufferSize}/{rppgData.maxBufferSize}
              </span>
            </div>
            <div className="bg-white/80 backdrop-blur-sm px-3 py-2 rounded-lg shadow-md">
              <span className="text-sm font-medium text-gray-700">
                Signal: {Math.round(rppgData.signalStrength)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Section */}
      <motion.div
        className="lg:w-1/3 p-6 bg-white/95 backdrop-blur-sm shadow-2xl"
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {/* Header */}
        <motion.div
          className="flex items-center space-x-3 mb-6 pb-4 border-b-2 border-gray-100"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <div className="relative">
            <HeartIcon className="h-10 w-10 text-red-500" />
            {rppgData.isProcessing && (
              <div className="absolute -top-1 -right-1 h-4 w-4 bg-green-400 rounded-full animate-ping"></div>
            )}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Vital Signs</h1>
            <p className="text-sm text-gray-600">Contactless Heart Rate Monitor</p>
          </div>
        </motion.div>

        {/* Dashboard Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <Dashboard rppgData={rppgData} />
        </motion.div>

        {/* Footer */}
        <motion.div
          className="mt-8 pt-4 border-t-2 border-gray-100"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <p className="text-xs text-gray-500 text-center">
            For educational purposes only. Not for medical diagnosis.
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
