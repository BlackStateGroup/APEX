# Initial thirty-seventh aggregate attempt

Exact raw fixed-runner output is preserved. One old Analysis chooser source-shape
assertion did not allow the new synchronous active-tab ref update needed by browser
ownership guards. Investigate and update the assertion without weakening the
chooser behavior requirement. Later stages marked not run are not passes.
The JavaScript inspection helper initially used a nonexistent stage name key;
that reporting-only lookup was corrected to id, with no effect on test execution.
