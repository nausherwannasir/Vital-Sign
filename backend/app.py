from flask import Flask, request, jsonify, send_from_directory
import numpy as np
from scipy.signal import detrend, butter, filtfilt, welch
import os

app = Flask(__name__, static_folder="../frontend")

def compute_bpm(sig, fs=30):
    sig = detrend(sig)
    b,a = butter(4, [0.8/(fs/2), 3.0/(fs/2)], btype='band')
    sig = filtfilt(b, a, sig)
    f, P = welch(sig, fs, nperseg=128)
    idx = np.logical_and(f>=0.8, f<=3.0)
    if not np.any(idx):
        return None
    peak = f[idx][np.argmax(P[idx])]
    return float(peak * 60)

@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json(force=True)
    sig  = data.get('signal', [])
    if len(sig) < 50:
        return jsonify({'bpm': None}), 400
    bpm = compute_bpm(np.array(sig), fs=30)
    return jsonify({'bpm': bpm})

# Static files for classic front-end
@app.route('/', defaults={'path': 'index.html'})
@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory(app.static_folder, path)

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=3000)
