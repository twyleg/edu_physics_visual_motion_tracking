#!/usr/bin/env python3
import argparse
import numpy as np
import pandas as pd

def fit_parabola(time_s: np.ndarray, pos_m: np.ndarray):
    """
    Fit x(t) = x0 + v0*(t-t0) + 0.5*a*(t-t0)^2
    via linear least squares.
    Returns: (t0, x0, v0, a, cov) where cov is 3x3 covariance of [x0,v0,a]
    """
    # Sort by time (just in case)
    idx = np.argsort(time_s)
    t = time_s[idx].astype(float)
    x = pos_m[idx].astype(float)

    t0 = t[0]
    tau = t - t0  # shifted time for numerical stability

    # Design matrix for parameters [x0, v0, a]
    # x = x0*1 + v0*tau + a*(0.5*tau^2)
    A = np.column_stack([np.ones_like(tau), tau, 0.5 * tau**2])

    beta, residuals, rank, svals = np.linalg.lstsq(A, x, rcond=None)
    x0, v0, a = beta

    # Estimate covariance from residual variance
    n = len(x)
    p = 3
    if n <= p:
        raise ValueError("Zu wenige Datenpunkte für eine 3-Parameter-Regression.")

    x_fit = A @ beta
    rss = np.sum((x - x_fit) ** 2)
    sigma2 = rss / (n - p)  # unbiased estimate
    cov = sigma2 * np.linalg.inv(A.T @ A)

    return t0, x0, v0, a, cov, x_fit, idx

def main():
    parser = argparse.ArgumentParser(
        description="Bestimme g aus Weg-Zeit-Daten (CSV: time_seconds,position_m) "
                    "per Regression des vollständigen Weg-Zeit-Gesetzes."
    )
    parser.add_argument("csv", help="Pfad zur CSV-Datei (Spalten: time_seconds,position_m)")
    parser.add_argument("--M_cart_g", type=float, default=185.62, help="Masse des Wagens in g (Default: 185.62)")
    parser.add_argument("--m_hang_g", type=float, default=25.10, help="Hängende Masse in g (Default: 25.10)")
    parser.add_argument("--delimiter", type=str, default=",", help="CSV Trennzeichen (Default: ,)")
    parser.add_argument("--no_header", action="store_true", help="CSV hat keine Kopfzeile")
    parser.add_argument("--plot", action="store_true", help="Plot anzeigen (benötigt matplotlib)")
    args = parser.parse_args()

    if args.no_header:
        df = pd.read_csv(args.csv, sep=args.delimiter, header=None, names=["time_seconds", "position_m"])
    else:
        df = pd.read_csv(args.csv, sep=args.delimiter)

    if "time_seconds" not in df.columns or "position_m" not in df.columns:
        raise ValueError("CSV muss die Spalten 'time_seconds' und 'position_m' enthalten.")

    t = df["time_seconds"].to_numpy()
    x = df["position_m"].to_numpy()

    t0, x0, v0, a, cov, x_fit, sort_idx = fit_parabola(t, x)

    # Standardfehler
    se = np.sqrt(np.diag(cov))
    x0_se, v0_se, a_se = se

    # g aus a
    M = args.M_cart_g / 1000.0  # kg
    m = args.m_hang_g / 1000.0  # kg
    if m <= 0:
        raise ValueError("m_hang_g muss > 0 sein.")

    g = a * (M + m) / m

    # Unsicherheit (nur aus a, M und m als exakt angenommen)
    g_se = (M + m) / m * a_se

    print("Regression: x(t)=x0 + v0*(t-t0) + 0.5*a*(t-t0)^2")
    print(f"t0 = {t0:.6f} s (erste Messzeit als Referenz)")
    print(f"x0 = {x0:.6f} m ± {x0_se:.6f}")
    print(f"v0 = {v0:.6f} m/s ± {v0_se:.6f}")
    print(f"a  = {a:.6f} m/s² ± {a_se:.6f}")
    print()
    print("Massen:")
    print(f"M (Wagen)    = {M:.6f} kg")
    print(f"m (hängend)  = {m:.6f} kg")
    print()
    print("Berechnung (idealisiert): a = m*g/(M+m)  =>  g = a*(M+m)/m")
    print(f"g = {g:.6f} m/s² ± {g_se:.6f}  (Fit-Statistik, ohne systematische Effekte)")

    if args.plot:
        import matplotlib.pyplot as plt

        # sortierte Daten für sauberen Plot
        t_sorted = t[sort_idx]
        x_sorted = x[sort_idx]

        plt.figure()
        plt.plot(t_sorted, x_sorted, "o", label="Messwerte")
        plt.plot(t_sorted, x_fit, "-", label="Fit")
        plt.xlabel("t (s)")
        plt.ylabel("x (m)")
        plt.title("Weg-Zeit-Regression")
        plt.legend()
        plt.show()

if __name__ == "__main__":
    main()
