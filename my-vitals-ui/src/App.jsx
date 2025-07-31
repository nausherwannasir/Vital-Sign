import React from 'react';
import VideoFeed from './components/VideoFeed';
import Dashboard from './components/Dashboard';
import { motion } from 'framer-motion';
import { HeartIcon } from '@heroicons/react/24/solid';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-base-200">
      <div className="md:w-2/3 flex justify-center p-4">
        <VideoFeed className="shadow-lg rounded-lg overflow-hidden" />
      </div>
      <motion.div
        className="md:w-1/3 p-6 space-y-6 bg-white shadow-inner"
        initial={{ opacity:0,x:50 }}
        animate={{ opacity:1,x:0 }}
      >
        <div className="flex items-center space-x-2">
          <HeartIcon className="h-8 w-8 text-red-500"/>
          <h1 className="text-2xl font-bold">Vital Signs</h1>
        </div>
        <Dashboard />
      </motion.div>
    </div>
  );
}
