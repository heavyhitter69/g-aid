"""Flat-topography 2.5-D DC resistivity forward (Dey & Morrison 1979).

Cell-centered conductivity, node-centered potential on a padded (x, z) mesh.
Cosine-transformed Poisson equation, inverse-transformed to 3-D point sources.
Topography is not used. This is not Res2DInv.
"""

from __future__ import annotations

import numpy as np
from scipy.sparse import coo_matrix, csc_matrix
from scipy.sparse.linalg import factorized


def geometric_factor(array: str, a: float, n: float = 1.0, mn: float | None = None) -> float:
    array = array.lower().replace("-", "_").replace(" ", "_")
    a = float(a)
    n = float(n)
    if array in {"wenner", "wenner_alpha"}:
        return 2.0 * np.pi * a
    if array in {"schlumberger", "wenner_schlumberger"}:
        mn_len = float(mn) if mn is not None else a
        l = n * a
        return np.pi * (l * l - (mn_len / 2.0) ** 2) / mn_len
    if array in {"dipole_dipole", "dipoledipole"}:
        return np.pi * n * (n + 1.0) * (n + 2.0) * a
    if array in {"pole_dipole", "poledipole"}:
        return 2.0 * np.pi * n * (n + 1.0) * a
    if array in {"pole_pole", "polepole"}:
        return 2.0 * np.pi * a
    raise ValueError(f"Unknown array type: {array}")


def quadrupole_positions(
    array: str, midpoint_x: float, a: float, n: float
) -> tuple[float | None, float | None, float | None, float | None]:
    """Return (A, M, N, B). None means a remote pole (potential 0)."""
    x0 = float(midpoint_x)
    a = float(a)
    n = float(n)
    name = array.lower().replace("-", "_").replace(" ", "_")
    if name in {"wenner", "wenner_alpha"}:
        return x0 - 1.5 * a, x0 - 0.5 * a, x0 + 0.5 * a, x0 + 1.5 * a
    if name in {"dipole_dipole", "dipoledipole"}:
        b = x0 - 0.5 * n * a
        m = x0 + 0.5 * n * a
        return b - a, m, m + a, b
    if name in {"schlumberger", "wenner_schlumberger"}:
        return x0 - n * a, x0 - 0.5 * a, x0 + 0.5 * a, x0 + n * a
    if name in {"pole_dipole", "poledipole"}:
        m = x0 - 0.5 * a
        nn = x0 + 0.5 * a
        return m - n * a, m, nn, None
    if name in {"pole_pole", "polepole"}:
        return x0 - 0.5 * a, x0 + 0.5 * a, None, None
    raise ValueError(f"Unknown array type: {array}")


def wenner_two_layer_image_series(a: float, h: float, rho1: float, rho2: float, n_terms: int = 160) -> float:
    k = (rho2 - rho1) / (rho2 + rho1)
    acc = 0.0
    for m in range(1, n_terms + 1):
        km = k**m
        acc += km / np.sqrt(1.0 + (2.0 * m * h / a) ** 2) - km / np.sqrt(4.0 + (2.0 * m * h / a) ** 2)
    return float(rho1 * (1.0 + 4.0 * acc))


def collect_electrodes(measurements: list[dict]) -> list[float]:
    xs: list[float] = []
    for m in measurements:
        array = str(m.get("array") or "wenner")
        for p in quadrupole_positions(array, m["midpoint_x"], m["a"], m["n"]):
            if p is not None:
                xs.append(float(p))
    return xs


def _wavenumbers(spread: float, dx: float, n_k: int) -> tuple[np.ndarray, np.ndarray]:
    kmin = 1.0 / max(6.0 * spread, 10.0)
    kmax = 1.0 / max(dx, 1e-3)
    ks = np.logspace(np.log10(kmin), np.log10(kmax), n_k)
    dln = np.log(ks[1] / ks[0]) if n_k > 1 else 1.0
    weights = (2.0 / np.pi) * ks * dln
    weights[0] *= 0.5
    weights[-1] *= 0.5
    return ks, weights


def _harmonic(a: float, b: float) -> float:
    if a <= 0.0 or b <= 0.0:
        return 0.0
    return 2.0 * a * b / (a + b)


def build_fd_grid(measurements: list[dict], zmax: float) -> tuple[np.ndarray, np.ndarray]:
    electrodes = collect_electrodes(measurements)
    xmin, xmax = min(electrodes), max(electrodes)
    spacings = [float(m["a"]) for m in measurements]
    span = max(xmax - xmin, min(spacings) * 4.0)
    dx = max(min(spacings) / 2.0, span / 48.0)
    pad = 0.65 * span
    x = np.arange(xmin - pad, xmax + pad + 0.5 * dx, dx)
    dz = dx
    z = np.arange(0.0, max(zmax, 3.0 * min(spacings)) + 0.45 * span + 0.5 * dz, dz)
    if len(x) > 70:
        x = np.linspace(xmin - pad, xmax + pad, 70)
        dx = float(x[1] - x[0])
        dz = dx
        z = np.arange(0.0, max(zmax, 3.0 * min(spacings)) + 0.45 * span + 0.5 * dz, dz)
    if len(z) > 36:
        z = np.linspace(0.0, z[-1], 36)
    if len(z) < 8:
        z = np.linspace(0.0, max(zmax, 4.0 * dx), 12)
    return x, z


def map_rho_to_fd(
    rho: np.ndarray, x_inv: np.ndarray, z_inv: np.ndarray, x_n: np.ndarray, z_n: np.ndarray
) -> np.ndarray:
    """Nearest inversion-cell resistivity onto FD cells (between nodes)."""
    x_c = 0.5 * (x_n[:-1] + x_n[1:])
    z_c = 0.5 * (z_n[:-1] + z_n[1:])
    ix = np.clip(np.searchsorted(x_inv, x_c) - 1, 0, rho.shape[1] - 1)
    iz = np.clip(np.searchsorted(z_inv, z_c) - 1, 0, rho.shape[0] - 1)
    return rho[iz[:, None], ix[None, :]]


def assemble_operator(sigma_cell: np.ndarray, k: float, dx: float, dz: float) -> csc_matrix:
    """Node-centered 5-point operator on potentials; sigma on cells."""
    ncz, ncx = sigma_cell.shape
    nx, nz = ncx + 1, ncz + 1
    n = nx * nz
    k2 = float(k) * float(k)
    inv_dx2 = 1.0 / (dx * dx)
    inv_dz2 = 1.0 / (dz * dz)

    def nid(iz: int, ix: int) -> int:
        return iz * nx + ix

    rows: list[int] = []
    cols: list[int] = []
    vals: list[float] = []

    def add(r: int, c: int, v: float) -> None:
        rows.append(r)
        cols.append(c)
        vals.append(v)

    def cell(iz_c: int, ix_c: int) -> float:
        iz_c = min(max(iz_c, 0), ncz - 1)
        ix_c = min(max(ix_c, 0), ncx - 1)
        return float(sigma_cell[iz_c, ix_c])

    for iz in range(nz):
        for ix in range(nx):
            p = nid(iz, ix)
            # cells touching this node
            s_nw = cell(max(iz - 1, 0), max(ix - 1, 0))
            s_ne = cell(max(iz - 1, 0), min(ix, ncx - 1))
            s_sw = cell(min(iz, ncz - 1), max(ix - 1, 0))
            s_se = cell(min(iz, ncz - 1), min(ix, ncx - 1))
            s_node = 0.25 * (s_nw + s_ne + s_sw + s_se)
            diag = -k2 * s_node
            if ix > 0:
                sw = _harmonic(s_nw, s_sw) * inv_dx2
                add(p, nid(iz, ix - 1), sw)
                diag -= sw
            else:
                diag -= s_node * inv_dx2
            if ix + 1 < nx:
                se = _harmonic(s_ne, s_se) * inv_dx2
                add(p, nid(iz, ix + 1), se)
                diag -= se
            else:
                diag -= s_node * inv_dx2
            if iz > 0:
                su = _harmonic(s_nw, s_ne) * inv_dz2
                add(p, nid(iz - 1, ix), su)
                diag -= su
            # iz==0: air, Neumann
            if iz + 1 < nz:
                sd = _harmonic(s_sw, s_se) * inv_dz2
                add(p, nid(iz + 1, ix), sd)
                diag -= sd
            else:
                diag -= s_node * inv_dz2
            add(p, p, diag)
    return coo_matrix((vals, (rows, cols)), shape=(n, n)).tocsc()


def _surface_node(x: float, x_n: np.ndarray) -> int:
    return int(np.clip(np.argmin(np.abs(x_n - x)), 0, len(x_n) - 1))


def _interp_surface(phi: np.ndarray, x: float, x_n: np.ndarray, nx: int) -> float:
    """Linear interpolation of surface (iz=0) potential."""
    if x <= x_n[0]:
        return float(phi[0])
    if x >= x_n[-1]:
        return float(phi[nx - 1])
    i = int(np.searchsorted(x_n, x) - 1)
    i = min(max(i, 0), nx - 2)
    t = (x - x_n[i]) / (x_n[i + 1] - x_n[i])
    return float((1.0 - t) * phi[i] + t * phi[i + 1])


class Forward25D:
    """Reusable factorized 2.5-D operator set for one conductivity model."""

    def __init__(self, measurements: list[dict], rho: np.ndarray, x_inv: np.ndarray, z_inv: np.ndarray, n_k: int = 6):
        self.measurements = measurements
        zmax = float(np.max(z_inv)) if len(z_inv) else 20.0
        self.x_n, self.z_n = build_fd_grid(measurements, zmax=max(zmax, 8.0))
        self.dx = float(self.x_n[1] - self.x_n[0])
        self.dz = float(self.z_n[1] - self.z_n[0])
        self.nx = len(self.x_n)
        self.nz = len(self.z_n)
        rho_fd = map_rho_to_fd(np.clip(rho, 1e-3, 1e6), np.asarray(x_inv, float), np.asarray(z_inv, float), self.x_n, self.z_n)
        self.sigma = 1.0 / rho_fd
        spread = float(self.x_n[-1] - self.x_n[0])
        self.ks, self.weights = _wavenumbers(spread, self.dx, n_k)
        self.solvers = [factorized(assemble_operator(self.sigma, k, self.dx, self.dz)) for k in self.ks]
        electrodes = collect_electrodes(measurements)
        self.unique = []
        for p in electrodes:
            if not any(abs(p - q) < 0.1 * self.dx for q in self.unique):
                self.unique.append(float(p))
        self.cache_full: dict[float, list[np.ndarray]] = {}
        self.cache_surface: dict[float, np.ndarray] = {}

    def pole_k_fields(self, source_x: float, current: float = 1.0) -> list[np.ndarray]:
        key = min(self.unique, key=lambda q: abs(q - source_x)) if self.unique else source_x
        if key in self.cache_full:
            return self.cache_full[key]
        src = _surface_node(source_x, self.x_n)
        rhs = np.zeros(self.nx * self.nz)
        rhs[src] = -float(current) / (self.dx * self.dz)
        fields = []
        acc = np.zeros(self.nx)
        for solve, w in zip(self.solvers, self.weights):
            phi = np.asarray(solve(rhs), float).reshape(self.nz, self.nx)
            fields.append(phi)
            acc += float(w) * phi[0]
        self.cache_full[key] = fields
        self.cache_surface[key] = acc
        return fields

    def pole_surface(self, source_x: float, current: float = 1.0) -> np.ndarray:
        key = min(self.unique, key=lambda q: abs(q - source_x)) if self.unique else source_x
        if key not in self.cache_surface:
            self.pole_k_fields(source_x, current)
        return self.cache_surface[key]

    def voltage(self, A: float | None, M: float | None, N: float | None, B: float | None, current: float = 1.0) -> float:
        def pot(src: float | None, rec: float | None) -> float:
            if src is None or rec is None:
                return 0.0
            return _interp_surface(self.pole_surface(src, current), rec, self.x_n, self.nx)

        return (pot(A, M) - pot(A, N)) - (pot(B, M) - pot(B, N))

    def apparent_resistivities(self, current: float = 1.0) -> np.ndarray:
        pred = np.empty(len(self.measurements), float)
        self._voltage_sign = np.ones(len(self.measurements))
        for i, m in enumerate(self.measurements):
            array = str(m.get("array") or "wenner")
            A, M, N, B = quadrupole_positions(array, m["midpoint_x"], m["a"], m["n"])
            v = self.voltage(A, M, N, B, current)
            self._voltage_sign[i] = 1.0 if v >= 0 else -1.0
            pred[i] = geometric_factor(array, float(m["a"]), float(m["n"])) * abs(v) / current
        return pred

    def _cell_gradients(self, phi: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        gx = 0.5 * ((phi[:-1, 1:] - phi[:-1, :-1]) + (phi[1:, 1:] - phi[1:, :-1])) / self.dx
        gz = 0.5 * ((phi[1:, :-1] - phi[:-1, :-1]) + (phi[1:, 1:] - phi[:-1, 1:])) / self.dz
        return gx, gz

    def _dot_grad(self, a: float | None, b: float | None) -> np.ndarray:
        ncz, ncx = self.sigma.shape
        if a is None or b is None:
            return np.zeros((ncz, ncx))
        fa = self.pole_k_fields(a)
        fb = self.pole_k_fields(b)
        acc = np.zeros((ncz, ncx))
        vol = self.dx * self.dz
        for w, pa, pb in zip(self.weights, fa, fb):
            gax, gaz = self._cell_gradients(pa)
            gbx, gbz = self._cell_gradients(pb)
            acc += float(w) * (-(gax * gbx + gaz * gbz) * vol)
        return acc

    def jacobian_dlogrhoa_dlogrho(
        self,
        x_inv: np.ndarray,
        z_inv: np.ndarray,
        pred: np.ndarray,
        current: float = 1.0,
    ) -> np.ndarray:
        """d log ρa / d log ρ on the inversion mesh using the DC Frechet ∇φ·∇φ kernel."""
        n_z, n_x = len(z_inv), len(x_inv)
        n_m = n_z * n_x
        j = np.zeros((len(self.measurements), n_m))
        x_c = 0.5 * (self.x_n[:-1] + self.x_n[1:])
        z_c = 0.5 * (self.z_n[:-1] + self.z_n[1:])
        ix = np.clip(np.searchsorted(x_inv, x_c) - 1, 0, n_x - 1)
        iz = np.clip(np.searchsorted(z_inv, z_c) - 1, 0, n_z - 1)
        for i, m in enumerate(self.measurements):
            array = str(m.get("array") or "wenner")
            A, M, N, B = quadrupole_positions(array, m["midpoint_x"], m["a"], m["n"])
            dV_ds = (
                self._dot_grad(A, M)
                - self._dot_grad(A, N)
                - self._dot_grad(B, M)
                + self._dot_grad(B, N)
            )
            kgeom = geometric_factor(array, float(m["a"]), float(m["n"]))
            sign = float(self._voltage_sign[i]) if hasattr(self, "_voltage_sign") else 1.0
            drhoa_ds = kgeom / current * sign * dV_ds
            # σ = 1/ρ, m=log ρ, dσ/dm = -σ
            drhoa_dm_cells = drhoa_ds * (-self.sigma)
            rhoa = max(abs(float(pred[i])), 1e-6)
            dlog_cells = drhoa_dm_cells / rhoa
            acc = np.zeros(n_m)
            for jz, z_idx in enumerate(iz):
                for jx, x_idx in enumerate(ix):
                    acc[z_idx * n_x + x_idx] += dlog_cells[jz, jx]
            j[i] = acc
        return j


def forward_rhoa(
    measurements: list[dict],
    rho: np.ndarray,
    x_inv: np.ndarray,
    z_inv: np.ndarray,
    n_k: int = 6,
    current: float = 1.0,
) -> np.ndarray:
    fwd = Forward25D(measurements, rho, x_inv, z_inv, n_k=n_k)
    return fwd.apparent_resistivities(current=current)


def homogeneous_scale(measurements: list[dict], x_inv: np.ndarray, z_inv: np.ndarray, n_k: int = 6) -> float:
    """Global scale so a 1 Ω·m half-space predicts median |ρa| ≈ 1.

    The 2.5-D cosine-transform source/inverse pair is not yet accurate enough
    for unscaled ρa. This factor is a documented limitation, not a physical
    parameter: n-level mesh/FT error remains after the scale is applied.
    """
    rho = np.ones((len(z_inv), len(x_inv)), float)
    pred = forward_rhoa(measurements, rho, x_inv, z_inv, n_k=n_k)
    finite = pred[np.isfinite(pred) & (np.abs(pred) > 1e-18)]
    if finite.size == 0:
        raise ValueError("2.5-D ERT forward produced no finite homogeneous potentials.")
    return 1.0 / float(np.median(np.abs(finite)))
