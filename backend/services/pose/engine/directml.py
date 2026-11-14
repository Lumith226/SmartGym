"""Configure DirectML sessions for the detector and single-frame pose model."""

import numpy as np
import onnxruntime as ort

from server.engine import InferenceEngine


def create_directml_engine(weights):
    provider = "DmlExecutionProvider"
    if provider not in ort.get_available_providers():
        raise RuntimeError("DirectML execution provider is unavailable")

    batch_model = weights / "rtmpose-m_simcc-body7_pt-body7_420e-256x192-e48f03d0_20230504_batch.onnx"
    if not batch_model.is_file():
        raise FileNotFoundError("Local RTMPose batch weights are required")

    engine = InferenceEngine("cpu")
    for model in (engine.pose.body.det_model, engine.pose.body.pose_model):
        options = ort.SessionOptions()
        options.enable_mem_pattern = False
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        options.log_severity_level = 3
        session = ort.InferenceSession(model.onnx_model, sess_options=options,
                                       providers=[provider, "CPUExecutionProvider"])
        if session.get_providers()[0] != provider:
            raise RuntimeError("DirectML session fell back to CPU during initialization")
        model.session = session
        inputs = {
            item.name: np.zeros([dim if isinstance(dim, int) and dim > 0 else 1
                                 for dim in item.shape], dtype=np.float32)
            for item in session.get_inputs()
        }
        session.run(None, inputs)

    # The provider's whole-video path batches RTMPose crops with dynamic shapes.
    batch_options = ort.SessionOptions()
    batch_options.intra_op_num_threads = 2
    batch_options.inter_op_num_threads = 1
    engine.pose.batch_session = ort.InferenceSession(str(batch_model), sess_options=batch_options,
                                                     providers=["CPUExecutionProvider"])
    engine.device = "dml"
    return engine
