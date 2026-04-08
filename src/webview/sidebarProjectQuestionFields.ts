export const projectQuestionFieldsSource = String.raw`
      function renderEssayQuestionField(value, questionIndex) {
        return \`
          <label class="essay-question-field">
            <span>문항 \${questionIndex + 1}</span>
            <textarea name="essayQuestions" placeholder="문항 하나를 입력하세요">\${escapeHtml(value || "")}</textarea>
          </label>
        \`;
      }

      function renderEssayQuestionFields(values) {
        const questionValues = Array.isArray(values) && values.length > 0 ? values : [""];
        return questionValues.map((value, questionIndex) => renderEssayQuestionField(value, questionIndex)).join("");
      }

      function appendEssayQuestionField(container, value) {
        if (!(container instanceof HTMLElement)) {
          return null;
        }

        const nextIndex = container.querySelectorAll('textarea[name="essayQuestions"]').length;
        container.insertAdjacentHTML("beforeend", renderEssayQuestionField(value || "", nextIndex));
        return container.querySelectorAll('textarea[name="essayQuestions"]').item(nextIndex);
      }

      function readQuestionFieldValues(formData) {
        return dedupeStrings(
          formData
            .getAll("essayQuestions")
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        );
      }
`;
