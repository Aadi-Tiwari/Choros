"""Train a small theme classifier on the labeled IRS2Go complaints and report held-out performance.

TF-IDF word and word-pair features with logistic regression. 80/20 stratified split, plus 5-fold
cross-validation for stability. The baseline always guesses the most common theme.
"""
import json, pickle
from pathlib import Path
from sklearn.dummy import DummyClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import make_pipeline

rows = json.loads(Path("data/labeled_reviews.json").read_text(encoding="utf-8"))
texts = [f"{r['title']}. {r['text']}" for r in rows]
labels = [r["theme"] for r in rows]

def model():
    return make_pipeline(TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True),
                         LogisticRegression(max_iter=2000, class_weight="balanced"))

x_train, x_test, y_train, y_test = train_test_split(texts, labels, test_size=0.2, stratify=labels, random_state=7)
clf = model().fit(x_train, y_train)
pred = clf.predict(x_test)
base = DummyClassifier(strategy="most_frequent").fit(x_train, y_train).predict(x_test)
cv = cross_val_score(model(), texts, labels, cv=StratifiedKFold(5, shuffle=True, random_state=7), scoring="accuracy")

result = {
    "train": len(x_train), "test": len(x_test),
    "accuracy": round(accuracy_score(y_test, pred), 3), "macro_f1": round(f1_score(y_test, pred, average="macro"), 3),
    "baseline_accuracy": round(accuracy_score(y_test, base), 3),
    "cv_accuracy_mean": round(cv.mean(), 3), "cv_accuracy_sd": round(cv.std(), 3),
    "per_theme": classification_report(y_test, pred, output_dict=True, zero_division=0),
}
Path("out").mkdir(exist_ok=True)
Path("out/classifier_metrics.json").write_text(json.dumps(result, indent=1), encoding="utf-8")
final = model().fit(texts, labels)
Path("out/theme_classifier.pkl").write_bytes(pickle.dumps(final))
print({k: v for k, v in result.items() if k != "per_theme"})
print(classification_report(y_test, pred, zero_division=0))
