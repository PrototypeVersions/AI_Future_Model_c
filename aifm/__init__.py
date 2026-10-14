"""AI Futures Model: an assumption-explicit model of AI training, oversight,
concealment and value formation. See docs/MODEL.md."""
from .model import simulate, ATTRACTORS, SERIES, time_grid  # noqa: F401
from .params import (  # noqa: F401
    central, sample, resolve, IDS, BY_ID, STRUCTURAL, DEFAULT_STRUCTURE,
)
from .outcomes import classify, shares, OUTCOMES  # noqa: F401

__version__ = "0.1.0"
