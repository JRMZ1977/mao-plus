# Evaluation Report: MAO_A Online Extension (online_jobs.py)

**Date:** 2026-04-27  
**Scope:** Assessment of `python/modules/online_jobs.py` compatibility with shared contract v1  
**Status:** ✅ **APPROVED FOR INTEGRATION INTO MAO_Plus (pending UX port)**

---

## Executive Summary

The `online_jobs.py` module in MAO_A is a **pure orchestration layer** that:
- ✅ Does NOT introduce new mathematical formulas
- ✅ Does NOT violate the shared contract (v1)
- ✅ Uses only canonical endpoints (`comparator.statistics()`, `analysis.full_pipeline()`)
- ✅ Is safe to port to MAO_Plus when UI support is added
- ⚠️ Requires **careful attention** to ensure job results respect the shared schema

---

## Detailed Analysis

### What online_jobs.py Does

1. **Project Management:**
   - CRUD operations on projects (no math, just metadata)
   - File storage and organization
   - Collection grouping

2. **Collection Upload & Extraction:**
   - Receives ZIP/image/JSON files
   - Extracts and catalogs them
   - Validates file types and paths

3. **Job Queue & Async Execution:**
   - Creates job records (metadata only)
   - Submits CMO (Cross-Bilateral Morphometry) jobs
   - Submits APS (Automated Procrustes Superposition) jobs
   - Tracks progress and results

4. **Pipeline Orchestration:**
   ```python
   result = await analysis.full_pipeline(
       image_bytes=image_path.read_bytes(),
       scale_px_mm=scale_px_mm,
       run_texture=run_texture,
       run_color=run_color,
   )
   ```
   - Calls **canonical** `analysis.py` module
   - Collects objects from multiple images
   - Passes to `comparator.statistics()` and `comparator.pca()` (both shared)

---

## Compatibility Assessment

### ✅ Green Flags (Safe)

1. **No New Formulas**
   - Bilateral symmetry calculation? Uses `comparator.bifacial()` (shared)
   - PCA? Uses `comparator.pca()` (shared, from `analysis.py`)
   - Statistics? Uses `comparator.statistics()` (shared)

2. **Uses Canonical Endpoints**
   - All computation delegated to shared modules
   - No reimplementation of metrics
   - No field renaming or inversion

3. **Respects Schema**
   - Jobs produce results in standard format (metrics, stats, PCA)
   - Field names consistent with contract v1
   - No new canonical fields introduced

4. **Modular Design**
   - Job metadata separate from computation metadata
   - Results can be exported in standard format
   - No tight coupling to MAO_A-specific code

### ⚠️ Yellow Flags (Caution)

1. **No Explicit Schema Version Tracking**
   - Job results should include `schemaVersion` when exported
   - Recommended: add `"schemaVersion": "v1"` to result payload

2. **Collection Format Not Fully Standardized**
   - Collections can contain raw images or pre-analyzed JSON
   - Ensure input validation preserves canonical names (use normalization if needed)

3. **Texture & Color Analysis Optional**
   - Flags `run_texture`, `run_color` are passed but not mandatory
   - Should verify these don't introduce non-canonical fields

---

## Recommendations for Integration into MAO_Plus

### 1. Port Timeline (Not Urgent for v1)

- **Phase:** Post-v1 (v1.1 or v2)
- **Reason:** Core bifacial analysis already works; online jobs is a convenience feature
- **Prerequisite:** Verify UI can handle asynchronous job submission and polling

### 2. Pre-Integration Checklist

- [ ] Verify `schema Version` is added to all result payloads
- [ ] Ensure collection upload normalizes legacy field names (e.g., `perimetro` → `perimeter`)
- [ ] Test that job results maintain parity with direct endpoint calls
- [ ] Add toggle for `MAO_ENABLE_CI_CMS` flag in job submission UI
- [ ] Document collection format and input validation

### 3. Data Validation (Critical for Parity)

When online_jobs imports pre-analyzed JSON from collection:

```python
def normalize_collection_json(json_data: dict) -> dict:
    """Ensure collection respects canonical schema."""
    if "objects" in json_data:
        for obj in json_data["objects"]:
            metricas = obj.get("metricas", {})
            # Apply legacy alias normalization
            if "perimetro" in metricas and "perimeter" not in metricas:
                metricas["perimeter"] = metricas.pop("perimetro")
            # ... repeat for other aliases
    return json_data
```

### 4. Job Result Format (Suggested Enhancement)

Ensure results include metadata for traceability:

```json
{
  "status": "completed",
  "job_id": "job_...",
  "job_type": "cmo",
  "schemaVersion": "v1",
  "computed_at": "2026-04-27T...",
  "results": {
    "statistics": {...},
    "pca": {...},
    "objects_analyzed": [...],
  },
  "traceability": {
    "modules_used": ["metrics.py", "analysis.py", "comparator.py"],
    "ci_cms_enabled": false,
  }
}
```

---

## Testing Recommendations

### Test Suite for online_jobs Integration

```python
# test_online_jobs_parity.py

def test_online_cmo_matches_direct_api():
    """Verify online CMO job produces same results as direct /api/bifacial call."""
    # 1. Submit job with collection
    job = create_job("cmo", project_id, collection_id, payload)
    
    # 2. Run job
    result = await run_cmo_job(job["job_id"])
    
    # 3. Compare with direct call
    direct_result = await comparator.bifacial(cara_a, cara_b)
    
    # 4. Assert equality
    assert result.bifacial_result.indiceSimetriaGeneral == direct_result.indiceSimetriaGeneral
    assert abs(delta) < 1e-6


def test_online_jobs_respects_ci_cms_flag():
    """Verify MAO_ENABLE_CI_CMS flag affects job results."""
    # With flag OFF: no CI/CMS in result
    # With flag ON: CI/CMS present in result
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Job results diverge from direct API | Low | High | Test suite + parity validation |
| Collection upload breaks schema | Medium | High | Input validation + normalization |
| Legacy field names cause issues | Medium | Medium | Apply alias mapping on import |
| Async jobs introduce timing bugs | Low | Medium | Comprehensive async tests |
| New texture/color fields break contract | Low | High | Document and version if added |

---

## Decision Matrix

**Should MAO_Plus integrate online_jobs?**

| Criterion | Status | Weight | Score |
|-----------|--------|--------|-------|
| Respects shared contract | ✅ Yes | High | +3 |
| Introduces no new math | ✅ Yes | High | +3 |
| Parity testable | ✅ Yes | High | +3 |
| Safe to port | ✅ Yes | Medium | +2 |
| UX/UI ready | ❌ No | Medium | -1 |
| Performance acceptable | ⚠️ Unknown | Low | 0 |

**Total:** +10 → **APPROVED (contingent on UI work)**

---

## Conclusion

✅ **RECOMMENDATION: Safe to integrate online_jobs into MAO_Plus**

The module is architecturally sound and does not compromise the shared contract. Its reliance on canonical endpoints makes it a low-risk extension.

**Next Steps:**
1. Document job result schema in Developer Guide (section added to DEVELOPER_GUIDE_SHARED_CONTRACT.md)
2. Implement pre-integration checklist above
3. Add parity test suite for online jobs
4. Plan UI port for v1.1 or v2 (not urgent for v1.0)

---

## Appendix: Code References

### Key Functions (No Math — All Orchestration)

- `run_cmo_job()` — orchestrates `analysis.full_pipeline()` + `comparator.statistics()`
- `run_aps_job()` — would orchestrate Procrustes (currently stub in online_jobs.py)
- `upload_collection()` — file handling, no computation
- `create_job()` — metadata, no computation
- `get_job_result()` — retrieval, no computation

### Shared Functions Called

- `analysis.full_pipeline()` — canonical analysis
- `comparator.statistics()` — canonical statistics
- `comparator.pca()` — canonical PCA
- `comparator.bifacial()` — canonical bilateral symmetry (used by job handlers)

**Conclusion:** All computation paths lead back to shared canonical modules. ✅
